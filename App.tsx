import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chat } from '@google/genai';
import { ChatMessage, Tab } from './types';
import { useGeolocation } from './hooks/useGeolocation';
import * as geminiService from './services/geminiService';
import { SendIcon, MicIcon, PaperClipIcon, MapIcon, ChatBubbleIcon, PlayIcon } from './components/icons';

// Audio decoding utilities
const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}


const App: React.FC = () => {
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [inputValue, setInputValue] = useState<string>('');
    const [inputImage, setInputImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<Tab>('chat');
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    const { location, error: locationError, loading: locationLoading } = useGeolocation();
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        setChatSession(geminiService.createChatSession());
        // FIX: Cast window to `any` to access browser-specific SpeechRecognition APIs without TypeScript errors.
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.lang = 'ku-IQ';
            recognitionRef.current.interimResults = false;
            
            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInputValue(transcript);
            };
            
            recognitionRef.current.onend = () => {
                setIsRecording(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                setIsRecording(false);
            };
        }
        
        // FIX: Cast window to `any` to access browser-specific webkitAudioContext API without TypeScript errors.
        audioContextRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

        // Greet user on first load
        const initialMessage: ChatMessage = {
            id: 'init',
            role: 'model',
            text: 'سڵاو! من دانام، یاریدەدەری زیرەکی تۆ. چۆن دەتوانم یارمەتیت بدەم؟',
        };
        setChatHistory([initialMessage]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const playAudio = useCallback(async (base64Audio: string) => {
        if (!audioContextRef.current || !base64Audio) return;
        try {
            const audioData = decode(base64Audio);
            const audioBuffer = await decodeAudioData(audioData, audioContextRef.current, 24000, 1);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            source.start();
        } catch (error) {
            console.error("Failed to play audio:", error);
        }
    }, []);

    const handleSendMessage = async () => {
        if ((!inputValue.trim() && !inputImage) || isLoading || !chatSession) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: inputValue,
            ...(inputImage && { image: inputImage.preview }),
        };

        setChatHistory(prev => [...prev, userMessage]);
        setIsLoading(true);
        setInputValue('');

        const imagePayload = inputImage ? { data: inputImage.data, mimeType: inputImage.mimeType } : undefined;
        setInputImage(null);

        try {
            const textResponse = await geminiService.generateTextResponse(chatSession, inputValue, imagePayload);
            const modelMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: textResponse,
            };
            setChatHistory(prev => [...prev, modelMessage]);

            const audioResponse = await geminiService.generateSpeech(textResponse);
            if (audioResponse) {
                playAudio(audioResponse);
            }
        } catch (err) {
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: "ببورە، هەڵەیەک ڕوویدا.",
            };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                const dataUrl = reader.result as string;
                setInputImage({ data: base64String, mimeType: file.type, preview: dataUrl });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const toggleRecording = () => {
        if (!recognitionRef.current) return;
        if (isRecording) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
        setIsRecording(!isRecording);
    };

    const ChatWindow = () => (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.map(msg => (
                <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0"></div>}
                    <div className={`max-w-md lg:max-w-2xl p-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 rounded-br-none' : 'bg-gray-700 rounded-bl-none'}`}>
                        {msg.image && <img src={msg.image} alt="Uploaded content" className="rounded-lg mb-2 max-h-60" />}
                        <p className="text-white whitespace-pre-wrap">{msg.text}</p>
                        {msg.role === 'model' && msg.id !== 'init' && (
                            <button 
                                onClick={async () => {
                                    const audio = await geminiService.generateSpeech(msg.text);
                                    if(audio) playAudio(audio);
                                }} 
                                className="text-gray-400 hover:text-white transition-colors mt-2"
                                aria-label="Play audio for this message"
                            >
                                <PlayIcon />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex items-end gap-2 justify-start">
                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0"></div>
                    <div className="bg-gray-700 p-3 rounded-2xl rounded-bl-none">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                        </div>
                    </div>
                </div>
            )}
            <div ref={chatEndRef}></div>
        </div>
    );
    
    const MapView = () => (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            {locationLoading && <p>وەرگرتنی شوێنی جوگرافی...</p>}
            {locationError && <p className="text-red-400">{locationError}</p>}
            {location && (
                <div className="w-full h-full rounded-lg overflow-hidden border-2 border-indigo-500">
                    <iframe
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude-0.1},${location.latitude-0.1},${location.longitude+0.1},${location.latitude+0.1}&layer=mapnik&marker=${location.latitude},${location.longitude}`}
                    ></iframe>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
            <header className="bg-gray-800/50 backdrop-blur-sm p-4 text-center shadow-lg border-b border-gray-700">
                <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">یاریدەدەری زیرەک - دانا</h1>
            </header>
            
            <main className="flex-1 flex flex-col overflow-hidden">
                {activeTab === 'chat' ? <ChatWindow /> : <MapView />}
            </main>

            {activeTab === 'chat' && (
            <footer className="bg-gray-800 p-3 border-t border-gray-700">
                {inputImage && (
                    <div className="relative w-24 h-24 mb-2 p-1 border border-gray-600 rounded">
                        <img src={inputImage.preview} alt="Preview" className="w-full h-full object-cover rounded" />
                        <button onClick={() => setInputImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">&times;</button>
                    </div>
                )}
                <div className="flex items-center bg-gray-700 rounded-full p-2">
                    <label htmlFor="file-upload" className="cursor-pointer text-gray-400 hover:text-white p-2">
                        <PaperClipIcon />
                    </label>
                    <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    
                    <button onClick={toggleRecording} className={`p-2 ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400 hover:text-white'}`}>
                        <MicIcon />
                    </button>
                    
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="پرسیارەکەت لێرە بنووسە..."
                        className="flex-1 bg-transparent focus:outline-none px-4 text-white placeholder-gray-500"
                        dir="rtl"
                    />
                    
                    <button onClick={handleSendMessage} disabled={isLoading} className="bg-blue-600 text-white rounded-full p-3 hover:bg-blue-700 disabled:bg-gray-500 transition-colors">
                        <SendIcon />
                    </button>
                </div>
            </footer>
            )}

            <nav className="bg-gray-800 flex justify-around p-2 border-t border-gray-700">
                <button onClick={() => setActiveTab('chat')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>
                    <ChatBubbleIcon />
                    <span className="text-xs">چات</span>
                </button>
                <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'map' ? 'text-blue-400' : 'text-gray-400 hover:text-white'}`}>
                    <MapIcon />
                    <span className="text-xs">نەخشە</span>
                </button>
            </nav>
        </div>
    );
};

export default App;
