/**
 * 硬件配置常数
 * 
 * 统一定义所有硬件相关的配置参数
 * 确保整个系统采用一致的采样率、波特率等参数
 */

export const HARDWARE_CONFIG = {
  // 采样率：500 Hz
  // 对应固定长度 512 样本 = 1.024 秒
  SAMPLE_RATE: 500,

  // 波特率：230400 (改为 230400，提高稳定性)
  BAUD_RATE: 230400,

  // 通道数
  NUM_CHANNELS: 3,

  // 固定波形长度：512 样本 @ 500Hz = 1.024 秒
  FIXED_WAVEFORM_LENGTH: 512,

  // 固定时长（毫秒）
  FIXED_DURATION_MS: (512 / 500) * 1000, // 1024 ms

  // 帧长度（字节）
  FRAME_LENGTH: 10, // [帧头 4 字节] + [数据 6 字节]

  // 帧头
  FRAME_HEADER: [0xCC, 0xCC, 0x01, 0x06],
};

export default HARDWARE_CONFIG;

// ===== 信号处理参数 =====
export const SIGNAL_PROCESSING = {
  // 陷波滤波器参数
  NOTCH_FREQUENCIES: [50, 60], // Hz
  NOTCH_QUALITY_FACTOR: 30,
  
  // 高通滤波器参数
  HIGHPASS_CUTOFF_FREQ: 20, // Hz
  
  // ICA 参数
  ICA_MAX_ITERATIONS: 500,
  ICA_TOLERANCE: 1e-5,
  
  // 波形裁剪参数
  CROP_PERCENTILE_HIGH_SNR: 0.30,
  CROP_PERCENTILE_MID_SNR: 0.25,
  CROP_PERCENTILE_LOW_SNR: 0.20,
  SNR_THRESHOLD_HIGH: 0.4,
  SNR_THRESHOLD_LOW: 0.3,
  
  // 特征提取参数
  FFT_SIZE: 512,
  MFCC_N_MELS: 40,
  MFCC_N_MFCC: 13,
  FREQUENCY_BANDS: 26, // 0-250Hz, 10Hz 间隔
};

// ===== CNN 模型参数 =====
export const CNN_CONFIG = {
  LEARNING_RATE: 0.001,
  BATCH_SIZE: 32,
  EPOCHS: 100,
  DROPOUT_RATE: 0.5,
  L2_REGULARIZATION: 0.0001,
};

// ===== 存储参数 =====
export const STORAGE_CONFIG = {
  MAX_COLLECTIONS_PER_COMMAND: 100,
  MAX_COMMANDS: 50,
  LOCALSTORAGE_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB
  INDEXEDDB_SIZE_LIMIT: 50 * 1024 * 1024, // 50MB
};

// ===== 识别参数 =====
export const RECOGNITION_CONFIG = {
  CONFIDENCE_THRESHOLD: 0.7,
  EUCLIDEAN_DISTANCE_THRESHOLD: 2.5,
  MIN_SAMPLES_FOR_RECOGNITION: 5,
};
