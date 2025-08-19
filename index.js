import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import util from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import textToSpeech from '@google-cloud/text-to-speech';
import speech from '@google-cloud/speech';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Use Gemini API Key from environment variables or hardcoded key
const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBE7Dfz-Ax024BLWMD_KvsGLbAd6Tq81sU';
if (!apiKey) {
  console.error('Gemini API key missing. Please check your API key.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const ttsClient = new textToSpeech.TextToSpeechClient();
const sttClient = new speech.SpeechClient();

app.use(cors());
app.use(bodyParser.json());

// POST endpoint for chatbot interactions
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: 'Message is required.' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // System prompt to instruct AI to respond in Indian Rupees (₹)
    const systemPrompt = {
      role: 'system',
      parts: [{
        text: `You are an e-commerce AI chatbot for Indian users. Always provide prices in Indian Rupees (₹). Convert any dollar prices to INR using an approximate rate of 1 USD = 75 INR. Format currency with ₹ symbol and commas (e.g., ₹7,500).`
      }]
    };

    const userMessage = {
      role: 'user',
      parts: [{ text: message }]
    };

    const result = await model.generateContent({
      contents: [systemPrompt, userMessage]
    });

    console.log('Full AI Response:', JSON.stringify(result, null, 2));

    const botMessage = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';

    // Convert AI response to speech
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text: botMessage },
      voice: { languageCode: 'en-IN', ssmlGender: 'NEUTRAL' }, // Changed to Indian English voice
      audioConfig: { audioEncoding: 'MP3' },
    });

    // Save speech audio
    const audioFile = 'public/bot-voice.mp3';
    await util.promisify(fs.writeFile)(audioFile, response.audioContent, 'binary');

    res.json({ reply: botMessage, audioUrl: `/bot-voice.mp3` });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ reply: 'Error processing your request.' });
  }
});

// POST endpoint for Speech-to-Text (Voice Input)
app.post('/voice-to-text', async (req, res) => {
  const { audioData } = req.body;
  if (!audioData) return res.status(400).json({ reply: 'Audio data is required.' });

  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    const [response] = await sttClient.recognize({
      audio: { content: audioBuffer.toString('base64') },
      config: { encoding: 'MP3', languageCode: 'en-IN' },  // Indian English recognition
    });

    const transcript = response.results?.[0]?.alternatives?.[0]?.transcript || 'Could not recognize speech.';
    res.json({ transcript });
  } catch (error) {
    console.error('Speech recognition error:', error.message);
    res.status(500).json({ transcript: 'Error recognizing speech.' });
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot server running on http://localhost:${PORT}`);
});
