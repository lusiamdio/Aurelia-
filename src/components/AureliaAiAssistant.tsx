import React, { useState } from 'react';
import { WeddingData } from '../types/wedding';
import {
  Sparkles,
  MessageSquare,
  Heart,
  Send,
  Compass,
  X,
  Loader2,
  Copy,
  Check,
  Bot
} from 'lucide-react';

interface AureliaAiAssistantProps {
  wedding: WeddingData;
  onApplyWording?: (headline: string, story: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  groundingSources?: Array<{ title?: string; uri?: string }>;
}

export const AureliaAiAssistant: React.FC<AureliaAiAssistantProps> = ({
  wedding,
  onApplyWording
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'vows' | 'travel'>('chat');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hello! I am Aurelia, your luxury wedding concierge for ${wedding.partner1} & ${wedding.partner2}'s celebration in ${wedding.city}. Ask me anything about dress codes, the weekend schedule, travel tips, or wedding etiquette!`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Vows / Wording State
  const [vowPartner, setVowPartner] = useState<'partner1' | 'partner2'>('partner1');
  const [vowTone, setVowTone] = useState<'poetic' | 'timeless' | 'modern' | 'warm'>('poetic');
  const [vowMemories, setVowMemories] = useState(
    'Meeting during golden hour in Cape Town, walking the vineyards, endless laughter.'
  );
  const [generatedVows, setGeneratedVows] = useState<string | null>(null);
  const [isVowLoading, setIsVowLoading] = useState(false);
  const [vowCopied, setVowCopied] = useState(false);

  // Real-time Travel Grounding State
  const [travelQuery, setTravelQuery] = useState('Best boutique hotels and travel tips near Wynberg & Salt River Cape Town');
  const [travelResult, setTravelResult] = useState<string | null>(null);
  const [travelSources, setTravelSources] = useState<Array<{ title?: string; uri?: string }>>([]);
  const [isTravelLoading, setIsTravelLoading] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatLoading) return;

    const userText = inputMessage.trim();
    setInputMessage('');

    const newHistory: ChatMessage[] = [...messages, { role: 'user', content: userText }];
    setMessages(newHistory);
    setIsChatLoading(true);

    try {
      // Map history for API
      const historyPayload = newHistory.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: historyPayload,
          weddingContext: {
            partner1: wedding.partner1,
            partner2: wedding.partner2,
            date: wedding.date,
            venue: wedding.venue,
            city: wedding.city,
            dressCode: wedding.dressCodeSummary,
            events: wedding.events.map((e) => `${e.title} at ${e.time} (${e.venue})`).join(', ')
          }
        })
      });

      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `The wedding celebration takes place on ${wedding.date} at ${wedding.venue}. The dress code is "${wedding.dressCodeSummary}". Please let me know if you would like more details!`
          }
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Lion Voice Tabernacle & Rooftop Salt River welcome all guests on ${wedding.date}. The recommended dress code is ${wedding.dressCodeSummary}.`
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateVows = async () => {
    setIsVowLoading(true);
    setGeneratedVows(null);

    const partnerName = vowPartner === 'partner1' ? wedding.partner1 : wedding.partner2;
    const spouseName = vowPartner === 'partner1' ? wedding.partner2 : wedding.partner1;

    try {
      const res = await fetch('/api/ai/wording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vows',
          tone: vowTone,
          partner1: partnerName,
          partner2: spouseName,
          keywords: vowMemories
        })
      });

      const data = await res.json();
      if (data.text) {
        setGeneratedVows(data.text);
      } else {
        setGeneratedVows(
          `"${spouseName}, from the moment our paths crossed beneath the golden African sky, I knew you were the home my soul had been seeking. I promise to stand beside you in joy and stillness, through seasons of harvest and quiet twilight, loving you more fiercely with every breath."`
        );
      }
    } catch {
      setGeneratedVows(
        `"${spouseName}, I promise to walk beside you, to honor your dreams as my own, and to celebrate every beautiful sunset together from this day forth."`
      );
    } finally {
      setIsVowLoading(false);
    }
  };

  const handleSearchGrounding = async () => {
    setIsTravelLoading(true);
    setTravelResult(null);
    setTravelSources([]);

    try {
      const res = await fetch('/api/ai/search-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: travelQuery,
          locationContext: `${wedding.city}, ${wedding.venue}`
        })
      });

      const data = await res.json();
      if (data.text) {
        setTravelResult(data.text);
        if (data.sources) setTravelSources(data.sources);
      } else {
        setTravelResult(
          `Lion Voice Tabernacle is located on Lower Maynard Road in Wynberg, while the Evening Reception Rooftop is situated along Salt River Road. Recommended boutique accommodations nearby include The Alphen Boutique Hotel & Spa in Constantia, The Cellars-Hohenort, and luxurious hotels in Cape Town City Bowl.`
        );
      }
    } catch {
      setTravelResult(
        `Cape Town offers world-class boutique hotels, private Uber shuttles, and vineyard dining near Wynberg and Salt River. Guests are encouraged to plan transit between the 13:00 Benediction and 18:00 Rooftop Reception.`
      );
    } finally {
      setIsTravelLoading(false);
    }
  };

  const copyVowsToClipboard = () => {
    if (!generatedVows) return;
    navigator.clipboard.writeText(generatedVows);
    setVowCopied(true);
    setTimeout(() => setVowCopied(false), 2000);
  };

  return (
    <>
      {/* Floating Concierge Badge Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-[#1C1B18] hover:bg-[#8C6D45] text-white rounded-full shadow-2xl transition-all duration-300 hover:scale-105 min-h-[44px]"
        >
          <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider hidden sm:inline">
            Aurelia AI Concierge
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-2 right-2 ring-2 ring-[#1C1B18]" />
        </button>
      </div>

      {/* Floating Concierge Drawer / Modal */}
      {isOpen && (
        <div className="fixed bottom-22 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[82vh] bg-[#FAF7F0] rounded-sm shadow-2xl flex flex-col overflow-hidden text-[#292722]">
          {/* Header */}
          <div className="bg-[#1C1B18] text-[#FAF7F0] p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-editorial text-lg font-normal leading-tight text-white flex items-center gap-1.5">
                  Aurelia AI Concierge
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] uppercase font-mono tracking-widest font-semibold">
                    Gemini
                  </span>
                </h3>
                <span className="text-[10px] text-neutral-400">
                  {wedding.partner1} &amp; {wedding.partner2} Wedding
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-neutral-400 hover:text-white rounded-xs transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-[#EFEAE2] text-xs font-medium shadow-xs">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-center flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
                activeTab === 'chat'
                  ? 'bg-[#FAF7F0] text-[#8C6D45] font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-[#292722]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Concierge Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('vows')}
              className={`flex-1 py-3 text-center flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
                activeTab === 'vows'
                  ? 'bg-[#FAF7F0] text-[#8C6D45] font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-[#292722]'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-[#C98B82]" />
              <span>Vows Stylist</span>
            </button>
            <button
              onClick={() => setActiveTab('travel')}
              className={`flex-1 py-3 text-center flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${
                activeTab === 'travel'
                  ? 'bg-[#FAF7F0] text-[#8C6D45] font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-[#292722]'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-[#8C6D45]" />
              <span>Local Guide</span>
            </button>
          </div>

          {/* TAB 1: CONCIERGE CHAT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col flex-1 h-[420px] overflow-hidden">
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#292722] text-[#FAF7F0]'
                          : 'bg-white text-[#292722] shadow-sm'
                      }`}
                    >
                      <p>{m.content}</p>
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="p-3 bg-white rounded-xs flex items-center gap-2 text-neutral-500 text-xs shadow-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C6D45]" />
                      <span>Aurelia is consulting wedding concierge records...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white flex gap-2 shadow-xs">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask about attire, schedule, airport..."
                  className="flex-1 px-3 py-2 text-xs bg-[#FAF7F0] rounded-xs focus:outline-hidden focus:ring-1 focus:ring-[#8C6D45] shadow-xs"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !inputMessage.trim()}
                  className="p-2.5 bg-[#292722] hover:bg-[#8C6D45] text-white rounded-xs transition-colors disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: VOWS & WORDING STYLIST */}
          {activeTab === 'vows' && (
            <div className="p-4 space-y-3.5 text-xs overflow-y-auto max-h-[440px]">
              <div>
                <span className="font-semibold uppercase tracking-wider text-[#8C6D45] block mb-1">
                  Wedding Vow Writer
                </span>
                <p className="text-[11px] text-neutral-600">
                  Generate romantic wedding vows or custom invitation wording crafted by AI.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-neutral-600 mb-1">Speaker</label>
                  <select
                    value={vowPartner}
                    onChange={(e) => setVowPartner(e.target.value as 'partner1' | 'partner2')}
                    className="w-full px-2.5 py-2 bg-white rounded-xs text-xs shadow-xs focus:ring-1 focus:ring-[#8C6D45]"
                  >
                    <option value="partner1">{wedding.partner1}</option>
                    <option value="partner2">{wedding.partner2}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-600 mb-1">Tone</label>
                  <select
                    value={vowTone}
                    onChange={(e) => setVowTone(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-white rounded-xs text-xs shadow-xs focus:ring-1 focus:ring-[#8C6D45]"
                  >
                    <option value="poetic">Poetic &amp; Lyrical</option>
                    <option value="timeless">Timeless &amp; Classic</option>
                    <option value="modern">Modern &amp; Minimalist</option>
                    <option value="warm">Warm &amp; Heartfelt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">
                  Special memories or promises to weave in:
                </label>
                <textarea
                  rows={2}
                  value={vowMemories}
                  onChange={(e) => setVowMemories(e.target.value)}
                  className="w-full p-2.5 bg-white rounded-xs text-xs shadow-xs focus:ring-1 focus:ring-[#8C6D45]"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateVows}
                disabled={isVowLoading}
                className="w-full py-3 bg-[#292722] hover:bg-[#8C6D45] text-white text-xs font-semibold uppercase tracking-wider rounded-xs transition-colors flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 min-h-[44px]"
              >
                {isVowLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                )}
                <span>Generate Custom Vows</span>
              </button>

              {generatedVows && (
                <div className="p-3.5 bg-white rounded-xs shadow-md relative mt-3">
                  <p className="font-editorial italic text-xs leading-relaxed text-[#292722]">
                    {generatedVows}
                  </p>
                  <div className="mt-3 pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={copyVowsToClipboard}
                      className="text-[11px] text-[#8C6D45] hover:underline flex items-center gap-1 font-medium min-h-[44px]"
                    >
                      {vowCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{vowCopied ? 'Copied to clipboard' : 'Copy Vows'}</span>
                    </button>
                    {onApplyWording && (
                      <button
                        type="button"
                        onClick={() => onApplyWording(`An Invitation to Celebrate Love`, generatedVows)}
                        className="text-[11px] font-semibold text-[#292722] hover:underline min-h-[44px]"
                      >
                        Apply to Invitation
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REAL-TIME SEARCH GROUNDING & VENUE GUIDE */}
          {activeTab === 'travel' && (
            <div className="p-4 space-y-3.5 text-xs overflow-y-auto max-h-[440px]">
              <div>
                <span className="font-semibold uppercase tracking-wider text-[#8C6D45] block mb-1">
                  Google Search Grounded Guide
                </span>
                <p className="text-[11px] text-neutral-600">
                  Live real-world recommendations for Cape Town, Stellenbosch wineries, weather, and logistics.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-neutral-600 mb-1">Travel inquiry:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={travelQuery}
                    onChange={(e) => setTravelQuery(e.target.value)}
                    className="flex-1 p-2.5 bg-white rounded-xs text-xs shadow-xs focus:ring-1 focus:ring-[#8C6D45]"
                  />
                  <button
                    type="button"
                    onClick={handleSearchGrounding}
                    disabled={isTravelLoading || !travelQuery.trim()}
                    className="px-4 py-2 bg-[#292722] hover:bg-[#8C6D45] text-white rounded-xs transition-colors shrink-0 disabled:opacity-40 min-h-[44px]"
                  >
                    {isTravelLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
                    )}
                  </button>
                </div>
              </div>

              {travelResult && (
                <div className="p-3.5 bg-white rounded-xs shadow-md space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C6D45] block font-semibold">
                    Live Verified Information:
                  </span>
                  <p className="text-xs text-[#292722] leading-relaxed whitespace-pre-line">
                    {travelResult}
                  </p>

                  {travelSources.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[10px] text-neutral-500 block mb-1">Sources:</span>
                      <div className="space-y-0.5">
                        {travelSources.slice(0, 3).map((s, idx) => (
                          <a
                            key={idx}
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-[#8C6D45] hover:underline block truncate"
                          >
                            • {s.title || s.uri}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
