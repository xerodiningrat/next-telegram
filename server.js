const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const midtransClient = require('midtrans-client');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

// Koneksi ke MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Definisikan skema dan model pengguna
const userSchema = new mongoose.Schema({
    chatId: { type: Number, unique: true },
});

const User = mongoose.model('User', userSchema);

const app = express();
const PORT = process.env.PORT || 3000;

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

let midtrans = new midtransClient.Snap({
    isProduction: false,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
});

function generateOrderId(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

const products = [
    { id: 1, name: "AI CHATGPT+", sold: 13300, description: "Sharing & Full Garansi.", variations: [{ duration: "1 Minggu", price: 10000, stock: 26 }, { duration: "1 Bulan", price: 30000, stock: 41 }] },
    { id: 2, name: "AI CLAUDE", sold: 9200, description: "Sharing & Full Garansi.", variations: [{ duration: "1 Minggu", price: 12000, stock: 20 }] },
];

// Function to create product detail messages
function getProductDetailsMessage(product) {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `
╭─────────────────✧
┊・ Produk: ${product.name}
┊・ Stok Terjual: ${product.sold}
┊・ Desk: ${product.description}
╰─────────────────✧
╭─────────────────✧
┊ Variasi, Harga & Stok:
${product.variations.map(v => `┊・ ${v.duration}: Rp ${v.price} - Stok: ${v.stock}`).join('\n')}
╰─────────────────✧
╰➤ Refresh at ${currentTime} WIB
    `;
}

let orderStatus = {};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Tambahkan chatId jika belum ada
    User.findOne({ chatId: chatId }, (err, foundUser) => {
        if (!foundUser) {
            const newUser = new User({ chatId: chatId });
            newUser.save().then(() => console.log(`New user added to database: ${chatId}`));
        }
    });

    const productList = `╭────────────✧
│   LIST PRODUK          
│─────────────
│ [1] AI CHATGPT+
│ [2] AI CLAUDE
│ [3] AI PERPLEXITY
│ [4] AI YOU
│ [5] ALIGHT MOTION
│ [6] APPLE ARCADE
│ [7] APPLE ICLOUD
│ [8] APPLE MUSIC
│ [9] CANVA
│ [10] DEEPL
│ [11] GDRIVE LIFETIME
│ [12] GOOGLEPAY DOKU
│ [13] GOOGLEPAY PAYCO
│ [14] GOOGLEPAY PSC
│ [15] GSUITE X DOKU
│ [16] GSUITE X PAYCO
│ [17] MUSIC APPLE
│ [18] MUSIC DEEZER
│ [19] MUSIC NAPSTER
│ [20] MUSIC PANDORA
│ [21] MUSIC QOBUZ
│ [22] MUSIC TIDAL
│ [23] PICSART
│ [24] RCTI+
│ [25] REMINI WEB
│ [26] SCRIBD
│ [27] TRADINGVIEW
│ [28] UNLOCK CHEGG
│ [29] UNLOCK ENVANTO
│ [30] UNLOCK FLATICON
│ [31] UNLOCK FREEPIK
│ [32] UNLOCK SCRIBD
│ [33] UNLOCK SLIDESHARE
│ [34] VISION+
│ [35] VPN EXPRESS
│ [36] VPN HMA
│ [37] VPN NORD
│ [38] VPN SURFSHARK
│ [39] ZOOM MEETING
╰────────────✧`;

    bot.sendMessage(chatId, `Selamat datang! Pilih produk dengan mengetik angka yang sesuai:\n${productList}`);
});

// Pesan produk dan pemrosesan lainnya
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    const selectedProduct = products.find(p => p.id == text);

    if (selectedProduct) {
        orderStatus[chatId] = { product: selectedProduct, quantity: 1 };

        const productDetailsMessage = getProductDetailsMessage(selectedProduct);

        bot.sendMessage(chatId, `${productDetailsMessage}`, {
            reply_markup: {
                inline_keyboard: selectedProduct.variations.map((v, index) => [{
                    text: `${v.duration}: Rp. ${v.price}`,
                    callback_data: `select_${index}`
                }])
                    .concat([[{ text: 'Refresh', callback_data: 'refresh' }]])
            }
        });
    } 
});

bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (!orderStatus[chatId]) return;

    const { product, quantity } = orderStatus[chatId];

    if (data.startsWith('select_')) {
        const variationIndex = parseInt(data.split('_')[1]);
        const selectedVariation = product.variations[variationIndex];

        orderStatus[chatId].variation = selectedVariation;

        const orderMessage = getOrderMessage(product, selectedVariation, quantity);

        bot.editMessageText(orderMessage, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '-', callback_data: 'decrease' }, { text: '+', callback_data: 'increase' }],
                    [{ text: 'Confirm Order', callback_data: 'confirm' }],
                    [{ text: 'Refresh', callback_data: 'refresh' }],
                    [{ text: 'Kembali', callback_data: 'back' }]
                ]
            }
        });
    } else if (data === 'confirm') {
        const { product, variation } = orderStatus[chatId];
        const totalAmount = variation.price * quantity;
        const orderId = generateOrderId(6);

        midtrans.createTransaction({
            transaction_details: {
                order_id: orderId,
                gross_amount: totalAmount
            },
            credit_card: {
                secure: true
            }
        }).then((transaction) => {
            const redirectUrl = transaction.redirect_url;

            bot.sendMessage(chatId, `Silahkan Melakukan Pembayaran Di Bawah Ini `, {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Bayar Sekarang', url: redirectUrl }]]
                }
            });

            checkTransactionStatus(chatId, orderId, 10000);
        }).catch((err) => {
            bot.sendMessage(chatId, `Terjadi kesalahan: ${err.message}`);
        });
    } else if (data === 'refresh') {
        const productDetailsMessage = getProductDetailsMessage(product);
        bot.editMessageText(productDetailsMessage, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            reply_markup: {
                inline_keyboard: product.variations.map((v, index) => [{
                    text: `${v.duration}: Rp. ${v.price}`,
                    callback_data: `select_${index}`
                }])
                    .concat([[{ text: 'Refresh', callback_data: 'refresh' }]])
            }
        });
    } else if (data === 'back') {
        const productList = `╭────────────✧
│   LIST PRODUK          
│─────────────
│ [1] AI CHATGPT+
│ [2] AI CLAUDE
╰────────────✧`;
        bot.sendMessage(chatId, `Kembali ke daftar produk. Ketik angka untuk memilih:\n${productList}`);
    }
});

function checkTransactionStatus(chatId, orderId, delay) {
    setTimeout(() => {
        console.log(`Checking status for order ID: ${orderId}`);

        midtrans.transaction.status(orderId)
            .then((statusResponse) => {
                console.log(`Status Response:`, statusResponse);

                const invoiceMessage = `
==================================
                       INVOICE
==================================
Tanggal & Waktu       : ${new Date().toLocaleString('id-ID')}
Order ID              : ${orderId}
Nama Produk           : ${orderStatus[chatId].product.name}
Variasi              : ${orderStatus[chatId].variation.duration}
Jumlah               : 1
Total                : Rp ${orderStatus[chatId].variation.price}
Status               : ${statusResponse.transaction_status}
==================================
                `;
                bot.sendMessage(chatId, invoiceMessage);
            })
            .catch((err) => {
                console.error(`Error checking transaction status: ${err.message}`);
                bot.sendMessage(chatId, `Terjadi kesalahan saat memeriksa status transaksi: ${err.message}`);
            });
    }, delay);
}

// Fungsi untuk mengirim pesan broadcast ke semua pengguna
cron.schedule('0 7,12,17 * * *', () => {
    console.log('Broadcast job executed');
    const message = "🔔 Pengumuman: Pastikan Anda memeriksa produk terbaru kami!";

    User.find({}, (err, users) => {
        if (err) {
            console.error(`Error fetching users: ${err.message}`);
            return;
        }

        users.forEach(user => {
            bot.sendMessage(user.chatId, message)
                .then(() => console.log(`Message sent to ${user.chatId}`))
                .catch(err => console.error(`Error sending message to ${user.chatId}: ${err.message}`));
        });
    });
});

// Jalankan server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
