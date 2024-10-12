const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const midtransClient = require('midtrans-client');
const cron = require('node-cron');

require('dotenv').config();

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

// Store chat IDs for broadcasting
const chatIds = [];

// Function to create product detail messages
function getProductDetailsMessage(product) {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `╭─────────────────✧
┊・ Produk: ${product.name}
┊・ Stok Terjual: ${product.sold}
┊・ Desk: ${product.description}
╰─────────────────✧
╭─────────────────✧
┊ Variasi, Harga & Stok:
${product.variations.map(v => `┊・ ${v.duration}: Rp ${v.price} - Stok: ${v.stock}`).join('\n')}
╰─────────────────✧
╰➤ Refresh at ${currentTime} WIB`;
}

let orderStatus = {};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Add chatId to the list if not already included
    if (!chatIds.includes(chatId)) {
        chatIds.push(chatId);
    }

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
Order ID              : ${statusResponse.order_id}
Jenis Transaksi        : ${statusResponse.payment_type}
Channel               : ${statusResponse.payment_type}
Status                : ${statusResponse.transaction_status === "settlement" ? "Berhasil" : statusResponse.transaction_status}
Nilai                 : Rp${statusResponse.gross_amount}
Email Pelanggan       : customer@example.com
==================================
          Terima kasih atas pembelian Anda!
     Silakan hubungi kami jika ada pertanyaan.
==================================`;

                if (statusResponse.transaction_status === "settlement") {
                    bot.sendMessage(chatId, `Pembayaran berhasil!\n${invoiceMessage}`, {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: 'Konfirmasi via WhatsApp', url: 'https://wa.me/6285888018854' }
                            ]]
                        }
                    });
                } else {
                    bot.sendMessage(chatId, `Pembayaran belum selesai. Status: ${statusResponse.transaction_status}`);
                }
            })
            .catch((err) => {
                console.error(`Error fetching transaction status: ${err.message}`);
                bot.sendMessage(chatId, `Terjadi kesalahan saat mengambil status transaksi: ${err.message}`);
            });
    }, delay);
}

function getOrderMessage(product, variation, quantity) {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `
Konfirmasi Pesanan
╭─────────────────╮
| Produk: ${product.name}   
│ Variasi: ${variation.duration}     
│ Harga satuan: Rp. ${variation.price}    
│ Stok tersedia: ${variation.stock}    
│─────────────────
│ Jumlah Pesanan: x${quantity}
│ Total Pembayaran: Rp. ${variation.price * quantity}    
╰─────────────────╯
╰➤ Refresh at ${currentTime} WIB`;
}

// Broadcasting messages every day at 7 AM, 12 PM, and 5 PM
cron.schedule('34 2,12,17 * * *', () => {
    console.log('Broadcast job executed');
    const message = "🔔 Pengumuman Spesial dari COINFIREBOOST INDONESIA! 🚀 Kami dengan bangga mempersembahkan layanan AI premium dan streaming premium yang akan mengubah cara Anda menikmati konten. 🎥✨ Dapatkan akses eksklusif ke fitur canggih yang dirancang untuk meningkatkan pengalaman Anda! 🎉 Jangan lewatkan kesempatan untuk menjelajahi dunia baru yang penuh inovasi. Kunjungi kami sekarang dan raih penawaran menarik yang hanya berlaku untuk Anda! 🌟";

    
    chatIds.forEach(chatId => {
        bot.sendMessage(chatId, message)
            .then(() => console.log(`Message sent to ${chatId}`))
            .catch(err => console.error(`Error sending message to ${chatId}: ${err.message}`));
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
