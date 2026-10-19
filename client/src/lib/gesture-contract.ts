/** The fourth command is intentional silent articulation, never a rest label. */
export interface GestureFrame {
  receivedAtMs: number;
  channels: [number, number, number];
}

export interface GestureConfig {
  sampleRate: 500 | 1000;
  channel: 0 | 1 | 2;
  windowSeconds: number;
  mainsHz: 0 | 50 | 60;
}

export interface GestureCommand {
  id: string;
  name: string;
  kind: 'rhythm' | 'subtle';
  expectedBursts?: number;
}

export const DEFAULT_GESTURE_COMMANDS: GestureCommand[] = [
  { id: 'long', name: '长咬牙', kind: 'rhythm', expectedBursts: 1 },
  { id: 'double', name: '两次短咬牙', kind: 'rhythm', expectedBursts: 2 },
  { id: 'triple', name: '三次短咬牙', kind: 'rhythm', expectedBursts: 3 },
  { id: 'water', name: '默念「喝水」', kind: 'subtle' },
];

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  sampleRate: 1000,
  channel: 1,
  windowSeconds: 4,
  mainsHz: 50,
};

export interface GestureExample {
  id: string;
  label: string; // 'rest' is calibration only, not one of the user's commands.
  frames: GestureFrame[];
}

export interface GesturePrediction {
  status: 'recognized' | 'rest' | 'unknown' | 'invalid';
  labelId?: string;
  labelName?: string;
  reason: string;
  scores: Array<{ labelId: string; distance: number }>;
  diagnostics: Record<string, number | string | boolean>;
}
