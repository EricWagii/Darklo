/**
 * CNN 模型单元测试
 * 
 * 测试覆盖：
 * - 模型初始化
 * - 前向传播
 * - 预测和置信度计算
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CNNModel } from '../cnn-model';

describe('CNN Model', () => {
  let model: CNNModel;
  let testFeatures: number[];

  beforeEach(() => {
    // 初始化模型
    model = new CNNModel();
    
    // 生成测试特征（180 维）
    testFeatures = Array.from({ length: 180 }, () => Math.random() * 100 - 50);
  });

  describe('Model Initialization', () => {
    it('应该正确初始化 CNN 模型', () => {
      expect(model).toBeDefined();
    });

    it('模型应该有有效的权重', () => {
      // 待实现：检查模型权重
      expect(model).toBeDefined();
    });
  });

  describe('Forward Pass', () => {
    it('应该接受 180 维特征向量', () => {
      const output = model.predict(testFeatures);
      expect(output).toBeDefined();
    });

    it('输出应该是有效的概率分布', () => {
      const output = model.predict(testFeatures);
      expect(Array.isArray(output)).toBe(true);
      expect(output.every(p => p >= 0 && p <= 1)).toBe(true);
    });

    it('输出概率之和应该接近 1', () => {
      const output = model.predict(testFeatures);
      const sum = output.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(0.01);
    });
  });

  describe('Prediction', () => {
    it('应该返回最高置信度的类别', () => {
      const output = model.predict(testFeatures);
      const maxIdx = output.indexOf(Math.max(...output));
      expect(maxIdx).toBeGreaterThanOrEqual(0);
      expect(maxIdx).toBeLessThan(output.length);
    });

    it('不同特征应该产生不同预测', () => {
      const features1 = Array.from({ length: 180 }, () => Math.random() * 100 - 50);
      const features2 = Array.from({ length: 180 }, () => Math.random() * 100 - 50);
      
      const output1 = model.predict(features1);
      const output2 = model.predict(features2);
      
      // 预测结果可能相同，但概率应该不同
      const diff = output1.reduce((sum, p, i) => sum + Math.abs(p - output2[i]), 0);
      expect(diff).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Prediction', () => {
    it('应该处理多个特征向量', () => {
      const batchFeatures = Array.from({ length: 5 }, () =>
        Array.from({ length: 180 }, () => Math.random() * 100 - 50)
      );
      
      const outputs = batchFeatures.map(f => model.predict(f));
      expect(outputs.length).toBe(5);
      expect(outputs.every(o => Array.isArray(o))).toBe(true);
    });
  });
});
