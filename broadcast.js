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

// Prevent starting another bot instance
if (!process.env.BOT_INSTANCE_RUNNING) {
    process.env.BOT_INSTANCE_RUNNING = 'true';

    // Your existing bot logic...

    // Function to send a broadcast message
    function sendBroadcast(message) {
        chatIds.forEach(chatId => {
            bot.sendMessage(chatId, message);
        });
    }

    // Schedule broadcasts with promotional messages
    cron.schedule('13 2 * * *', () => {
        sendBroadcast('🌅 Good morning! Check out our special offer: 20% off on all products today! Use code: MORNING20');
    });

    cron.schedule('0 12 * * *', () => {
        sendBroadcast('🌞 Good afternoon! Limited time: Buy one, get one free on selected items! Hurry, while stocks last!');
    });

    cron.schedule('0 15 * * *', () => {
        sendBroadcast('🌇 Good afternoon! 15% off on subscriptions! Upgrade now and save! Use code: AFTERNOON15');
    });

    cron.schedule('0 19 * * *', () => {
        sendBroadcast('🌙 Good evening! Don\'t miss out on our evening special: Free shipping on all orders above $50!');
    });

    console.log('Broadcast schedule set up!');
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
