export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { body } = req;

    // Memastikan bahwa ini adalah pesan dari Telegram
    const chatId = body.message?.chat?.id;
    const text = body.message?.text;

    // Balasan untuk pesan /start
    try {
      if (text === '/start') {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Selamat datang di bot saya!',
          }),
        });
      } 
      // Balasan untuk pesan selain /start
      else {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Anda mengirim: ${text}`,
          }),
        });
      }

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
      res.status(500).json({ error: 'Failed to send message to Telegram' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
