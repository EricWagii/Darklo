export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * 耳周肌电信号采集与识别系统 - 共享常量
 * 
 * 设计理念：
 * - 所有指令采用双音节或短句，便于肌肉活动区分
 * - 特征提取基于时域分析（均值、方差、RMS）
 * - 识别使用欧几里得距离相似度
 * - 所有数据本地存储，不上传服务器
 */

// ============ 硬件配置 ============
export const HARDWARE_CONFIG = {
  // 前端增益（电极板规格）
  GAIN: 723,
  
  // 电极数量
  NUM_CHANNELS: 3,
  
  // 推荐采样率（Hz）
  SAMPLE_RATE: 500,
  
  // 串口波特率
  BAUD_RATE: 115200,
};

// ============ 采集参数 ============
export const COLLECTION_CONFIG = {
  // 每条指令采集次数
  SAMPLES_PER_COMMAND: 3,
  
  // 单次采集时长（秒）
  COLLECTION_DURATION: 3,
  
  // 采集前倒计时（秒）
  COUNTDOWN_BEFORE_COLLECTION: 3,
  
  // 采集间隔（秒）
  INTERVAL_BETWEEN_SAMPLES: 2,
};

// ============ 识别参数 ============
export const RECOGNITION_CONFIG = {
  // 单次识别采集时长（秒）
  RECOGNITION_DURATION: 3,
  
  // 识别前倒计时（秒）
  COUNTDOWN_BEFORE_RECOGNITION: 3,
  
  // 置信度阈值（0-1）
  CONFIDENCE_THRESHOLD: 0.6,
  
  // 距离阈值（用于判断是否识别成功）
  DISTANCE_THRESHOLD: 50,
};

// ============ 预设指令库 ============
export const PREDEFINED_COMMANDS = [
  {
    id: 'cmd_001',
    name: '开始',
    description: '启动系统',
    difficulty: 'easy' as const,
  },
  {
    id: 'cmd_002',
    name: '停止',
    description: '停止系统',
    difficulty: 'easy' as const,
  },
  {
    id: 'cmd_003',
    name: '上升',
    description: '向上移动',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_004',
    name: '下降',
    description: '向下移动',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_005',
    name: '左转',
    description: '向左移动',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_006',
    name: '右转',
    description: '向右移动',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_007',
    name: '确认',
    description: '确认操作',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_008',
    name: '取消',
    description: '取消操作',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_009',
    name: '播放',
    description: '播放内容',
    difficulty: 'medium' as const,
  },
  {
    id: 'cmd_010',
    name: '暂停',
    description: '暂停内容',
    difficulty: 'medium' as const,
  },
];

// ============ 数据库配置 ============
export const DB_CONFIG = {
  // IndexedDB 数据库名称
  DB_NAME: 'EMGDatabase',
  // 数据库版本
  // ✅ 修改5：升级到v6以统一schema并创建缺失的stores
  DB_VERSION: 6,
  // 存储对象名称（所有stores使用 keyPath: 'key'）
  STORES: {
    // 核心数据
    COMMANDS: 'commands',
    RECOGNITION_RECORDS: 'recognitionRecords',
    FEEDBACK_DATA: 'feedbackData',
    CALIBRATION_DATA: 'calibrationData',
    
    // 模型与状态
    CNN_MODEL: 'cnnModel',           // 单一CNN模型
    CNN_MODELS: 'cnnModels',         // 多个CNN模型（兼容旧数据）
    CNN_STATE: 'cnnState',           // CNN训练状态
    COMMAND_TEMPLATES: 'commandTemplates',  // 指令模板
    
    // 用户与会话
    USER_ACCOUNTS: 'userAccounts',
    SESSIONS: 'sessions',
    
    // 训练与融合
    TRAINING_DATA: 'trainingData',
    MULTI_CHANNEL_FUSION: 'multiChannelFusion',
    
    // 日志与配置
    AUDIT_LOGS: 'auditLogs',
    SYSTEM_VERSION: 'systemVersion',
    ADAPTIVE_THRESHOLDS: 'adaptiveThresholds',
  },
};

// ============ 特征提取配置 ============
export const FEATURE_CONFIG = {
  // 特征类型
  FEATURE_TYPES: ['mean', 'variance', 'rms'] as const,
  
  // 低通滤波器截止频率（Hz）
  LOWPASS_CUTOFF: 200,
  
  // 高通滤波器截止频率（Hz）
  HIGHPASS_CUTOFF: 20,
};

// ============ 错误消息 ============
export const ERROR_MESSAGES = {
  NO_SERIAL_PORT: '浏览器不支持 Web Serial API，请使用 Chrome、Edge 或 Opera 浏览器。',
  PORT_NOT_FOUND: '未找到串口设备，请检查硬件连接。',
  PORT_OPEN_FAILED: '无法打开串口，请检查设备权限。',
  INVALID_DATA: '接收到无效数据，请检查硬件连接。',
  DB_INIT_FAILED: '数据库初始化失败。',
  TRAINING_INCOMPLETE: '训练数据不完整，请重新采集。',
  NO_TRAINING_DATA: '没有训练数据，请先进行采集训练。',
};

// ============ 成功消息 ============
export const SUCCESS_MESSAGES = {
  PORT_CONNECTED: '串口连接成功！',
  DATA_SAVED: '数据保存成功！',
  TRAINING_COMPLETE: '训练完成！',
  RECOGNITION_SUCCESS: '识别成功！',
};

// ============ 数据类型定义 ============
export interface EMGSample {
  timestamp: number;
  values: number[]; // 3个电极的数据
  sampleRate: number;
}

export interface FeatureVector {
  mean: number[];
  variance: number[];
  rms: number[];
}

export interface TrainingData {
  id?: number;
  commandId: string;
  commandName: string;
  samples: EMGSample[][];
  features: FeatureVector[];
  averageFeature: FeatureVector;
  timestamp: number;
}

export interface RecognitionResult {
  recognizedCommand: string;
  confidence: number;
  distances: { [commandId: string]: number };
  timestamp: number;
}
