/**
 * CNN 模型管理系统
 * 
 * 功能：
 * - 从训练数据生成 CNN 模型
 * - 模型保存和加载
 * - 模型推理
 * - 模型性能评估
 */

import { CNNModel, TrainingData, createAndTrainCNNModel, recognizeWithCNN } from './cnn-model';
import { extractFullFeatures } from './dsp-processor';
import { emgDatabase } from './db';
import { HARDWARE_CONFIG } from '@shared/hardware-config';
import { logger } from './logger';

export interface CommandTrainingData {
  name: string;
  samples: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>;
}

export interface CNNModelState {
  model: CNNModel | null;
  commandNames: string[];
  isTraining: boolean;
  trainingProgress: number;
  lastTrainingTime: number;
}

/**
 * CNN 模型管理器
 */
export class CNNModelManager {
  private modelState: CNNModelState = {
    model: null,
    commandNames: [],
    isTraining: false,
    trainingProgress: 0,
    lastTrainingTime: 0,
  };

  /**
   * 从训练数据生成 CNN 模型
   */
  async generateModelFromTrainingData(
    trainingDataList: CommandTrainingData[]
  ): Promise<{ success: boolean; message: string; model?: CNNModel }> {
    try {
      if (trainingDataList.length === 0) {
        return { success: false, message: '没有训练数据' };
      }

      this.modelState.isTraining = true;
      this.modelState.trainingProgress = 0;

      // 1. 提取特征向量
      const features: number[][] = [];
      const labels: number[] = [];

      for (let cmdIdx = 0; cmdIdx < trainingDataList.length; cmdIdx++) {
        const cmd = trainingDataList[cmdIdx];
        logger.log(`处理指令: ${cmd.name} (${cmd.samples.length} 个样本)`);

        for (const sample of cmd.samples) {
          const emgFeatures = extractFullFeatures(sample.ch1, sample.ch2, sample.ch3, HARDWARE_CONFIG.SAMPLE_RATE, true);
          features.push(emgFeatures.fullFeature);
          labels.push(cmdIdx);
        }

        this.modelState.trainingProgress = ((cmdIdx + 1) / trainingDataList.length) * 50;
      }
      // 2. 训练 CNN 模型
      const trainingData: TrainingData = { features, labels };
      const model = createAndTrainCNNModel(trainingData, trainingDataList.length, features[0].length);

      this.modelState.trainingProgress = 100;
      this.modelState.model = model;
      this.modelState.commandNames = trainingDataList.map((cmd) => cmd.name);
      this.modelState.lastTrainingTime = Date.now();

      // 3. 保存模型
      await this.saveModel();
      this.modelState.isTraining = false;

      return {
        success: true,
        message: `模型训练完成: ${trainingDataList.length} 个指令, ${features.length} 个样本`,
        model,
      };
    } catch (error) {
      console.error('[CNN] 模型训练失败:', error);
      this.modelState.isTraining = false;
      return {
        success: false,
        message: `模型训练失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 使用 CNN 模型进行识别
   */
  recognize(
    ch1: number[],
    ch2: number[],
    ch3: number[],
    confidenceThreshold: number = 0.6
  ): {
    success: boolean;
    command?: string;
    confidence?: number;
    allProbabilities?: { command: string; probability: number }[];
    message: string;
  } {
    try {
      if (!this.modelState.model) {
        return { success: false, message: '模型未加载，请先训练模型' };
      }

      // 提取特征
      const emgFeatures = extractFullFeatures(ch1, ch2, ch3, HARDWARE_CONFIG.SAMPLE_RATE, true);
      const features = emgFeatures.fullFeature;

      // 使用 CNN 模型进行识别
      const result = recognizeWithCNN(this.modelState.model, features, this.modelState.commandNames);

      // 检查置信度阈值
      if (result.confidence < confidenceThreshold * 100) {
        return {
          success: true,
          message: '置信度不足',
          command: undefined,
          confidence: result.confidence,
          allProbabilities: result.allProbabilities,
        };
      }

      return {
        success: true,
        message: '识别成功',
        command: result.predictedCommand,
        confidence: result.confidence,
        allProbabilities: result.allProbabilities,
      };
    } catch (error) {
      console.error('[CNN] 识别失败:', error);
      return {
        success: false,
        message: `识别失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 保存模型到 IndexedDB
   */
  private async saveModel(): Promise<void> {
    try {
      if (!this.modelState.model) return;

      const modelJson = this.modelState.model.toJSON();
      const state = {
        commandNames: this.modelState.commandNames,
        lastTrainingTime: this.modelState.lastTrainingTime,
      };

      // ✅ 修改2修正：改用IndexedDB保存CNN模型
      await emgDatabase.saveModel(modelJson);
      await emgDatabase.saveCNNState(state);
    } catch (error) {
      console.error('[CNN] 模型保存失败:', error);
    }
  }

  /**
   * 从 IndexedDB 加载模型
   */
  async loadModel(): Promise<boolean> {
    try {
      // ✅ 修改2修正：改用IndexedDB加载CNN模型
      const result = await emgDatabase.getModel();

      if (!result) {
        return false;
      }

      const { modelJson, state } = result;

      const model = CNNModel.fromJSON(modelJson);

      this.modelState.model = model;
      this.modelState.commandNames = state.commandNames;
      this.modelState.lastTrainingTime = state.lastTrainingTime;
      return true;
    } catch (error) {
      console.error('[CNN] 模型加载失败:', error);
      return false;
    }
  }

  /**
   * 删除保存的模型
   */
  async deleteModel(): Promise<void> {
    // ✅ 修改2修正：改用IndexedDB删除CNN模型
    await emgDatabase.deleteModel();
    this.modelState.model = null;
    this.modelState.commandNames = [];
  }

  /**
   * 获取模型状态
   */
  getModelState(): CNNModelState {
    return { ...this.modelState };
  }

  /**
   * 检查模型是否已加载
   */
  isModelLoaded(): boolean {
    return this.modelState.model !== null;
  }

  /**
   * 获取命令列表
   */
  getCommandNames(): string[] {
    return [...this.modelState.commandNames];
  }
}

// 创建全局模型管理器实例
export const cnnModelManager = new CNNModelManager();
