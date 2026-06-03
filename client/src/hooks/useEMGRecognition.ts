/**
 * React Hook - EMG 识别管理
 */

import { useState, useCallback, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';
import {
  extractTimeFeatures,
  calculateEuclideanDistance,
  calculateConfidence,
} from '@/lib/signal-processing';
import { emgDatabase } from '@/lib/db';
import {
  RecognitionResult,
  RECOGNITION_CONFIG,
  TrainingData,
} from '@/../../shared/const';

export interface UseEMGRecognitionReturn {
  isRecognizing: boolean;
  result: RecognitionResult | null;
  error: string | null;
  startRecognition: () => void;
  stopRecognition: () => void;
  addData: (data: EMGData) => void;
  recognize: () => Promise<void>;
}

export function useEMGRecognition(): UseEMGRecognitionReturn {
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentSampleDataRef = useRef<number[][]>([]);
  const startTimeRef = useRef<number>(0);

  const startRecognition = useCallback(() => {
    try {
      setError(null);
      currentSampleDataRef.current = [];
      startTimeRef.current = Date.now();
      setIsRecognizing(true);
      setResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别启动失败';
      setError(message);
    }
  }, []);

  const stopRecognition = useCallback(() => {
    setIsRecognizing(false);
    currentSampleDataRef.current = [];
  }, []);

  const addData = useCallback(
    (data: EMGData) => {
      if (!isRecognizing) return;

      // 检查采集时长
      const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
      if (elapsedTime > RECOGNITION_CONFIG.RECOGNITION_DURATION) {
        // 采集完成
        setIsRecognizing(false);
        return;
      }

      // 添加数据点
      currentSampleDataRef.current.push([
        data.channels[0],
        data.channels[1],
        data.channels[2],
      ]);
    },
    [isRecognizing]
  );

  const recognize = useCallback(async () => {
    try {
      setError(null);

      if (currentSampleDataRef.current.length === 0) {
        throw new Error('没有采集到数据');
      }

      // 获取所有训练数据
      const trainingDataList = await emgDatabase.getAllTrainingData();

      if (trainingDataList.length === 0) {
        throw new Error('没有训练数据，请先进行采集训练');
      }

      // 提取当前采集数据的特征
      const testFeature = extractTimeFeatures(currentSampleDataRef.current);

      // 计算与所有训练数据的距离
      const distances: { [commandId: string]: number } = {};
      const commandNames: { [commandId: string]: string } = {};

      for (const training of trainingDataList) {
        const distance = calculateEuclideanDistance(
          testFeature,
          training.averageFeature
        );
        distances[training.commandId] = distance;
        commandNames[training.commandId] = training.commandName;
      }

      // 找到最小距离
      const minDistance = Math.min(...Object.values(distances));
      const recognizedCommandId = Object.keys(distances).find(
        (id) => distances[id] === minDistance
      );

      if (!recognizedCommandId) {
        throw new Error('识别失败');
      }

      // 计算置信度
      const confidence = calculateConfidence(minDistance);

      // 创建结果
      const recognitionResult: RecognitionResult = {
        recognizedCommand: commandNames[recognizedCommandId],
        confidence,
        distances,
        timestamp: Date.now(),
      };

      setResult(recognitionResult);
      currentSampleDataRef.current = [];
    } catch (err) {
      const message = err instanceof Error ? err.message : '识别失败';
      setError(message);
    }
  }, []);

  return {
    isRecognizing,
    result,
    error,
    startRecognition,
    stopRecognition,
    addData,
    recognize,
  };
}
