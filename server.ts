import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with User-Agent header
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    })
  : null;

// 1. AI Concierge & Wedding Stylist Chat
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, coupleNames, venue, date } = req.body;
    if (!ai) {
      return res.status(200).json({
        reply: `Welcome to the Wedding Concierge! How can I assist you with ${coupleNames || 'Samson & Kevine'}'s wedding celebration at ${venue || 'Lion Voice Tabernacle & Rooftop 39 Salt River Road'}? You can ask me about guest dress codes (Vintage Wear & Gala Wear), the schedule, or Cape Town travel!`
      });
    }

    const systemInstruction = `You are the bespoke luxury wedding concierge and stationery stylist representing ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding celebration in Cape Town, South Africa on ${date || 'Saturday, 20 March 2027'}.
Venues:
- Wedding Benediction: Lion Voice Tabernacle (11 Lower Maynard Rd Wynberg Station, Tailan Building Basement Hall) at 13:00. Dress code: Vintage Wear. Scripture: "Therefore what God has joined together, let no one separate. — Mark 10:9".
- Evening Reception: Rooftop, 39 Salt River Road, Salt River, Cape Town from 18:00 to 21:00. Dress code: Gala Wear. Scripture: "I will restore to you the years that the swarming locust has eaten. — Joel 2:25".
You assist both the couple and wedding guests with gracious etiquette, dress codes (Vintage Wear for Church, Gala Wear for Dining), schedule timings, and travel to Wynberg and Salt River. Always maintain an elegant, warm, and refined editorial tone. Keep answers helpful and concise (under 120 words unless asked for a speech or vows).`;

    // Format chat history
    const history = (messages || []).slice(0, -1).map((m: any) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const lastMessage = messages?.[messages.length - 1]?.text || 'Hello';

    const chat = ai.chats.create({
      model: 'gemini-3.8-flash',
      history,
      config: {
        systemInstruction
      }
    });

    const response = await chat.sendMessage({
      message: lastMessage
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(200).json({
      reply: 'I would be delighted to assist you with any questions regarding the celebration schedule (Wedding Benediction at 13:00 & Evening Reception at 18:00), attire (Vintage Wear & Gala Wear), or venue directions in Cape Town.'
    });
  }
});

// 2. AI Wording & Vow Stylist
app.post('/api/ai/wording', async (req, res) => {
  try {
    const { type, partner1, partner2, venue, mood } = req.body;
    if (!ai) {
      return res.json({
        wording: `Together with their families, ${partner1 || 'Samson'} and ${partner2 || 'Kevine'} request the pleasure of your company to celebrate their sacred union at ${venue || 'Lion Voice Tabernacle & Rooftop Salt River'}. "Therefore what God has joined together, let no one separate. — Mark 10:9"`
      });
    }

    const prompt = `Write a luxury, evocative wedding ${type || 'invitation wording'} for ${partner1 || 'Samson Ilunga'} & ${partner2 || 'Kevine Bonganga'} getting married in Cape Town.
Scriptures: "Therefore what God has joined together, let no one separate. — Mark 10:9" and "I will restore to you the years that the swarming locust has eaten. — Joel 2:25".
Tone: ${mood || 'European regal elegance with warm biblical grace and poetic romance'}.
Provide 2 short options: Option 1 (Classic Formal) and Option 2 (Poetic Romantic). Plain text only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt
    });

    res.json({ wording: response.text });
  } catch (err: any) {
    console.error('Wording error:', err);
    res.json({
      wording: `Together with their families, ${req.body.partner1 || 'Sarah'} & ${req.body.partner2 || 'James'} request the honour of your presence at their marriage celebration.`
    });
  }
});

// 3. AI DJ Playlist & Transitions Curator
app.post('/api/ai/dj-playlist', async (req, res) => {
  try {
    const { songRequests, coupleNames } = req.body;
    if (!ai) {
      return res.json({
        plan: '1. Welcome & Cocktails: Sunset acoustic strings and jazz standards.\n2. Dinner: Sophisticated bossa nova and vintage soul.\n3. First Dance: Timeless romantic ballad.\n4. Peak Dance Floor: Motown, 80s classics, and modern euphoric pop.\n5. Midnight Encore: High-energy singalongs.'
      });
    }

    const songsStr = (songRequests || []).map((s: any) => `"${s.songTitle}" by ${s.artist} (requested by ${s.guestName})`).join(', ');

    const prompt = `Act as an elite luxury wedding DJ curator for ${coupleNames || 'Sarah & James'}'s wedding.
The guests have submitted these song requests: ${songsStr || 'Etta James, Frankie Valli, Earth Wind & Fire, Stevie Wonder'}.
Organize these into a cohesive 4-part reception setflow (Cocktails, Dinner, First Dance & Golden Hour, Peak Dancing) with seamless transitions and 3 recommended transition tracks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt
    });

    res.json({ plan: response.text });
  } catch (err: any) {
    console.error('DJ playlist error:', err);
    res.json({
      plan: '1. Cocktails: Acoustic strings\n2. Dinner: Soul & Jazz\n3. Dance: High-energy classics'
    });
  }
});

// 4. AI Google Search Grounding for Venue & Cape Town Travel Guide
app.post('/api/ai/search-grounding', async (req, res) => {
  try {
    const { query } = req.body;
    if (!ai) {
      return res.json({
        answer: 'Molenvliet Estate is located on the Helshoogte Pass between Stellenbosch and Franschhoek, approximately 45 minutes from Cape Town International Airport. March offers warm, sunny autumn temperatures averaging 26°C (78°F).'
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Answer the following guest inquiry regarding travel, weather, or venue for a Stellenbosch/Cape Town wedding: ${query}`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    res.json({ answer: response.text });
  } catch (err: any) {
    console.error('Search grounding error:', err);
    res.json({
      answer: 'Stellenbosch and the Cape Winelands are accessible via Cape Town International Airport (CPT). Uber, private shuttles, and luxury rental cars are readily available.'
    });
  }
});

// 5. Real-Time Gemini AI Bespoke Content for PDF Generation & Download
app.post('/api/pdf/gemini-content', async (req, res) => {
  try {
    const { type, guestName, guestId, hasPlusOne, plusOneName, coupleNames, venue, date, dressCode } = req.body;
    
    if (!ai) {
      if (type === 'card') {
        return res.json({
          blessing: `May your gracious presence elevate this sacred union as Samson and Kevine unite their hearts before God and family. We hold your cherished presence in deepest honour.`,
          proclamation: `Therefore what God has joined together, let no one separate. — Mark 10:9`
        });
      } else {
        return res.json({
          protocolNote: `Kindly present this verified gate pass upon arrival. Lion Voice Tabernacle Benediction commences at 13:00, followed by Evening Reception at Rooftop Salt River at 18:00.`,
          dressCodeRemark: `Attire Etiquette: Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear.`
        });
      }
    }

    if (type === 'card') {
      const prompt = `You are a royal wedding calligrapher and poet crafting a personalized ceremonial dedication on an official luxury landscape wedding invitation card for ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding celebration in Cape Town, Western Cape.
Venues: Lion Voice Tabernacle (13:00) & Rooftop 39 Salt River Road (18:00-21:00).
Scripture: "Therefore what God has joined together, let no one separate. — Mark 10:9"
Honoured Guest: ${guestName || 'Honoured Guest'}
${hasPlusOne ? `Accompanying Guest: ${plusOneName || 'Guest'}` : 'Individual Attendee'}

Provide:
1. "blessing": A bespoke, poetic, and heartwarming ceremonial dedication honoring this guest's presence and God's blessings over the union (2 sentences, 25-35 words, dignified, eloquent, and deeply touching).
2. "proclamation": "Therefore what God has joined together, let no one separate. — Mark 10:9".

Respond in valid JSON format only:
{
  "blessing": "...",
  "proclamation": "..."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        blessing: parsed.blessing || `May your gracious presence elevate this sacred union as Samson and Kevine unite their hearts before God and family.`,
        proclamation: parsed.proclamation || `Therefore what God has joined together, let no one separate. — Mark 10:9`
      });
    } else {
      // type === 'pass'
      const prompt = `You are the lead protocol director for ${coupleNames || 'Samson Ilunga & Kevine Bonganga'}'s wedding.
Venues: Lion Voice Tabernacle (13:00) and Rooftop, 39 Salt River Road (18:00 to 21:00).
Dress code: ${dressCode || 'Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear'}
Primary Guest: ${guestName || 'Honoured Guest'}
Pass ID: ${guestId || 'AUR-8012'}
${hasPlusOne ? `Accompanying Plus-One: ${plusOneName || 'Guest'}` : 'Single Attendee'}

Provide:
1. "protocolNote": A welcoming arrival protocol note for this guest detailing entrance to Lion Voice Tabernacle and Rooftop Salt River (25-30 words).
2. "dressCodeRemark": "Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear".

Respond in valid JSON format only:
{
  "protocolNote": "...",
  "dressCodeRemark": "..."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        protocolNote: parsed.protocolNote || `Kindly present this verified gate pass upon arrival at Lion Voice Tabernacle (13:00) and Rooftop Salt River (18:00).`,
        dressCodeRemark: parsed.dressCodeRemark || `Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear`
      });
    }
  } catch (err: any) {
    console.error('Gemini PDF generation error:', err);
    res.json({
      blessing: `May your presence grace this union as two souls entwine their destinies in Cape Town. We hold your companionship in profound reverence.`,
      proclamation: `Therefore what God has joined together, let no one separate. — Mark 10:9`,
      protocolNote: `Kindly present this verified gate pass upon arrival at Lion Voice Tabernacle (13:00) and Rooftop Salt River (18:00).`,
      dressCodeRemark: `Church Ceremony: Vintage Wear · Dinning Ceremony: Gala Wear`
    });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Aurelia Wedding Server running on port ${port}`);
  });
}

startServer();
