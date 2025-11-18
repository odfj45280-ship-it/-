
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 data URL
}

export type Tab = 'chat' | 'map';

export interface Location {
    latitude: number;
    longitude: number;
}
