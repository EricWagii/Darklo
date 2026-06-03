/**
 * CNN 模型实现 - 修复版本
 * 
 * 功能：
 * - 构建 1D CNN 模型
 * - 完整的反向传播实现
 * - 模型训练和推理
 * - 模型保存和加载
 */

import { logger } from './logger';

export interface CNNModelConfig {
  inputSize: number;
  numClasses: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
}

export interface TrainingData {
  features: number[][];
  labels: number[];
}

/**
 * 简化的 1D CNN 层
 */
class Conv1DLayer {
  filters: number[][][];
  biases: number[];
  kernelSize: number;
  numFilters: number;

  constructor(kernelSize: number, numFilters: number, inputSize: number) {
    this.kernelSize = kernelSize;
    this.numFilters = numFilters;
    this.filters = [];
    this.biases = Array(numFilters).fill(0);

    for (let i = 0; i < numFilters; i++) {
      const filter: number[][] = [];
      for (let j = 0; j < kernelSize; j++) {
        const row: number[] = [];
        for (let k = 0; k < inputSize; k++) {
          row.push((Math.random() - 0.5) * 0.1);
        }
        filter.push(row);
      }
      this.filters.push(filter);
    }
  }

  forward(input: number[]): number[] {
    const output: number[] = [];

    for (let f = 0; f < this.numFilters; f++) {
      let sum = this.biases[f];
      for (let i = 0; i <= input.length - this.kernelSize; i++) {
        for (let k = 0; k < this.kernelSize; k++) {
          sum += input[i + k] * this.filters[f][k][0];
        }
      }
      output.push(Math.max(0, sum));
    }

    return output;
  }
}

/**
 * 简化的全连接层
 */
class DenseLayer {
  weights: number[][];
  biases: number[];
  inputSize: number;
  outputSize: number;

  constructor(inputSize: number, outputSize: number) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.weights = [];
    this.biases = Array(outputSize).fill(0);

    for (let i = 0; i < inputSize; i++) {
      const row: number[] = [];
      for (let j = 0; j < outputSize; j++) {
        row.push((Math.random() - 0.5) * 0.1);
      }
      this.weights.push(row);
    }
  }

  forward(input: number[]): number[] {
    const output: number[] = Array(this.outputSize).fill(0);

    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.outputSize; j++) {
        output[j] += input[i] * this.weights[i][j];
      }
    }

    for (let j = 0; j < this.outputSize; j++) {
      output[j] += this.biases[j];
    }

    return output;
  }
}

/**
 * 修复版 CNN 模型 - 完整反向传播
 */
export class CNNModel {
  config: CNNModelConfig;
  conv1: Conv1DLayer;
  dense1: DenseLayer;
  dense2: DenseLayer;

  constructor(config: CNNModelConfig) {
    this.config = config;
    this.conv1 = new Conv1DLayer(3, 32, config.inputSize);
    this.dense1 = new DenseLayer(32, 128);
    this.dense2 = new DenseLayer(128, config.numClasses);
  }

  /**
   * 前向传播
   */
  forward(input: number[]): number[] {
    const conv1Out = this.conv1.forward(input);
    const dense1Out = this.dense1.forward(conv1Out);
    const dense1Activated = dense1Out.map((x) => Math.max(0, x));
    const output = this.dense2.forward(dense1Activated);
    return this.softmax(output);
  }

  /**
   * Softmax 激活函数
   */
  private softmax(input: number[]): number[] {
    const maxVal = Math.max(...input);
    const exps = input.map((x) => Math.exp(x - maxVal));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    return exps.map((x) => x / sumExp);
  }

  /**
   * 完整的反向传播 - 修复版本
   */
  private updateWeights(
    input: number[],
    output: number[],
    label: number,
    learningRate: number
  ): void {
    // 1. 前向传播中间结果
    const conv1Out = this.conv1.forward(input);
    const dense1Out = this.dense1.forward(conv1Out);
    const dense1Activated = dense1Out.map((x) => Math.max(0, x));

    // 2. 输出层梯度（Softmax + CrossEntropy）
    const outputGradient = output.slice();
    outputGradient[label] -= 1;

    // 3. 更新 Dense2（输出层）权重和偏置
    for (let i = 0; i < this.dense1.outputSize; i++) {
      for (let j = 0; j < this.config.numClasses; j++) {
        const gradient = outputGradient[j] * dense1Activated[i];
        this.dense2.weights[i][j] -= learningRate * gradient;
      }
    }

    // 更新 Dense2 偏置
    for (let j = 0; j < this.config.numClasses; j++) {
      this.dense2.biases[j] -= learningRate * outputGradient[j];
    }

    // 4. 计算 Dense1 的梯度
    const dense1Gradient = Array(this.dense1.outputSize).fill(0);
    for (let i = 0; i < this.dense1.outputSize; i++) {
      for (let j = 0; j < this.config.numClasses; j++) {
        dense1Gradient[i] += outputGradient[j] * this.dense2.weights[i][j];
      }
      // ReLU 梯度
      dense1Gradient[i] *= dense1Out[i] > 0 ? 1 : 0;
    }

    // 5. 更新 Dense1 权重和偏置
    for (let i = 0; i < this.conv1.numFilters; i++) {
      for (let j = 0; j < this.dense1.outputSize; j++) {
        const gradient = dense1Gradient[j] * conv1Out[i];
        this.dense1.weights[i][j] -= learningRate * gradient;
      }
    }

    // 更新 Dense1 偏置
    for (let j = 0; j < this.dense1.outputSize; j++) {
      this.dense1.biases[j] -= learningRate * dense1Gradient[j];
    }

    // 6. 计算 Conv1D 的梯度
    for (let f = 0; f < this.conv1.numFilters; f++) {
      let convGradient = 0;
      for (let j = 0; j < this.dense1.outputSize; j++) {
        convGradient += dense1Gradient[j] * this.dense1.weights[f][j];
      }
      // ReLU 梯度
      convGradient *= conv1Out[f] > 0 ? 1 : 0;

      // 更新 Conv1D 偏置
      this.conv1.biases[f] -= learningRate * convGradient;

      // 更新 Conv1D 滤波器权重
      for (let k = 0; k < this.conv1.kernelSize; k++) {
        for (let i = 0; i < input.length - this.conv1.kernelSize + 1; i++) {
          const gradient = convGradient * input[i + k];
          this.conv1.filters[f][k][0] -= learningRate * gradient;
        }
      }
    }
  }

  /**
   * 训练模型 - 修复版本
   */
  train(trainingData: TrainingData): void {
    const { features, labels } = trainingData;
    const { epochs, batchSize, learningRate } = this.config;
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let correctCount = 0;

      // 批处理训练
      for (let batch = 0; batch < features.length; batch += batchSize) {
        const batchEnd = Math.min(batch + batchSize, features.length);

        for (let i = batch; i < batchEnd; i++) {
          const output = this.forward(features[i]);
          const label = labels[i];
          const predictedLabel = output.indexOf(Math.max(...output));

          // 交叉熵损失
          const loss = -Math.log(Math.max(output[label], 1e-10));
          totalLoss += loss;

          if (predictedLabel === label) {
            correctCount++;
          }

          // 完整的反向传播
          this.updateWeights(features[i], output, label, learningRate);
        }
      }

      const accuracy = (correctCount / features.length) * 100;
      const avgLoss = totalLoss / features.length;

      // 每 10 个 epoch 打印日志
      if ((epoch + 1) % 10 === 0) {
        logger.log(`Epoch ${epoch + 1}/${epochs}, Loss: ${avgLoss.toFixed(4)}, Accuracy: ${accuracy.toFixed(2)}%`);
      }
    }
  }

  /**
   * 预测
   */
  predict(input: number[]): { classIdx: number; confidence: number; probabilities: number[] } {
    const output = this.forward(input);
    const classIdx = output.indexOf(Math.max(...output));
    const confidence = output[classIdx];

    return {
      classIdx,
      confidence,
      probabilities: output,
    };
  }

  /**
   * 评估模型
   */
  evaluate(testData: TrainingData): { accuracy: number; loss: number } {
    const { features, labels } = testData;
    let correctCount = 0;
    let totalLoss = 0;

    for (let i = 0; i < features.length; i++) {
      const output = this.forward(features[i]);
      const label = labels[i];
      const predictedLabel = output.indexOf(Math.max(...output));

      if (predictedLabel === label) {
        correctCount++;
      }

      const loss = -Math.log(Math.max(output[label], 1e-10));
      totalLoss += loss;
    }

    const accuracy = correctCount / features.length;
    const loss = totalLoss / features.length;

    return { accuracy, loss };
  }

  /**
   * 保存模型到 JSON
   */
  toJSON(): string {
    const modelData = {
      config: this.config,
      conv1Filters: this.conv1.filters,
      conv1Biases: this.conv1.biases,
      dense1Weights: this.dense1.weights,
      dense1Biases: this.dense1.biases,
      dense2Weights: this.dense2.weights,
      dense2Biases: this.dense2.biases,
    };

    return JSON.stringify(modelData);
  }

  /**
   * 从 JSON 加载模型
   */
  static fromJSON(jsonStr: string): CNNModel {
    const modelData = JSON.parse(jsonStr);
    const model = new CNNModel(modelData.config);

    model.conv1.filters = modelData.conv1Filters;
    model.conv1.biases = modelData.conv1Biases;
    model.dense1.weights = modelData.dense1Weights;
    model.dense1.biases = modelData.dense1Biases;
    model.dense2.weights = modelData.dense2Weights;
    model.dense2.biases = modelData.dense2Biases;

    return model;
  }
}

/**
 * 创建和训练 CNN 模型
 */
export function createAndTrainCNNModel(
  trainingData: TrainingData,
  numClasses: number,
  inputSize: number = 150
): CNNModel {
  const config: CNNModelConfig = {
    inputSize,
    numClasses,
    learningRate: 0.01,
    epochs: 100,
    batchSize: 8,
  };

  const model = new CNNModel(config);
  model.train(trainingData);

  return model;
}

/**
 * 使用 CNN 模型进行识别
 */
export function recognizeWithCNN(
  model: CNNModel,
  features: number[],
  commandNames: string[]
): {
  predictedCommand: string;
  confidence: number;
  allProbabilities: { command: string; probability: number }[];
} {
  const prediction = model.predict(features);

  const allProbabilities = commandNames.map((name, idx) => ({
    command: name,
    probability: prediction.probabilities[idx],
  }));

  return {
    predictedCommand: commandNames[prediction.classIdx],
    confidence: prediction.confidence * 100,
    allProbabilities: allProbabilities.sort((a, b) => b.probability - a.probability),
  };
}
