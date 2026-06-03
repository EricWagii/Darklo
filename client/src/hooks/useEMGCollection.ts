/**
 * React Hook - EMG 采集训练管理
 */

import { useState, useCallback, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';
import { extractTimeFeatures, averageFeatures } from '@/lib/signal-processing';
import { emgDatabase } from '@/lib/db';
import { TrainingData, COLLECTION_CONFIG, HARDWARE_CONFIG } from '@/../../shared/const';

export interface UseEMGCollectionReturn {
  isCollecting: boolean;
  currentSample: number;
  totalSamples: number;
  collectedData: number[][][];
  trainingData: TrainingData | null;
  error: string | null;
  startCollection: (commandId: string, commandName: string) => void;
  stopCollection: () => void;
  addData: (data: EMGData) => void;
  saveTraining: () => Promise<void>;
}

export function useEMGCollection(): UseEMGCollectionReturn {
  const [isCollecting, setIsCollecting] = useState(false);
  const [currentSample, setCurrentSample] = useState(0);
  const [collectedData, setCollectedData] = useState<number[][][]>([]);
  const [trainingData, setTrainingData] = useState<TrainingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commandIdRef = useRef<string>('');
  const commandNameRef = useRef<string>('');
  const currentSampleDataRef = useRef<number[][]>([]);
  const startTimeRef = useRef<number>(0);

  // 使用 useRef 代替状态标志以避免闭包陷阱
  // isCollectingRef 与 state 同步更新，但在 addData 回调中使用 ref 以获得最新值
  const isCollectingRef = useRef(false);
  const currentSampleRef = useRef(0);

  const startCollection = useCallback(
    (commandId: string, commandName: string) => {
      try {
        setError(null);
        commandIdRef.current = commandId;
        commandNameRef.current = commandName;
        currentSampleDataRef.current = [];
        startTimeRef.current = Date.now();
        setIsCollecting(true);
        setCurrentSample(1);
        isCollectingRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : '采集启动失败';
        setError(message);
      }
    },
    []
  );

  const stopCollection = useCallback(() => {
    setIsCollecting(false);
    currentSampleDataRef.current = [];
    isCollectingRef.current = false;
  }, []);

  const addData = useCallback(
    (data: EMGData) => {
      if (!isCollectingRef.current) return;

      // 检查采集时长
      const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
      if (elapsedTime > COLLECTION_CONFIG.COLLECTION_DURATION) {
        // 采集完成
        setIsCollecting(false);

        // 保存采集的数据
        setCollectedData((prev) => [...prev, currentSampleDataRef.current]);

        // 重置
        currentSampleDataRef.current = [];
        startTimeRef.current = Date.now();

        // 如果还有更多采样需要进行，继续
        if (currentSample < COLLECTION_CONFIG.SAMPLES_PER_COMMAND) {
          setCurrentSample((prev) => prev + 1);
          currentSampleRef.current = currentSample + 1;
        }

        return;
      }

      // 添加数据点
      currentSampleDataRef.current.push([
        data.channels[0],
        data.channels[1],
        data.channels[2],
      ]);
    },
    [isCollectingRef, currentSampleRef]
  );

  const saveTraining = useCallback(async () => {
    try {
      setError(null);

      if (collectedData.length === 0) {
        throw new Error('没有采集到数据');
      }

      // 提取特征
      const features = collectedData.map((samples) =>
        extractTimeFeatures(samples)
      );

      // 计算平均特征
      const averageFeature = averageFeatures(features);

      // 创建训练数据对象
      const training: TrainingData = {
        commandId: commandIdRef.current,
        commandName: commandNameRef.current,
        samples: collectedData as any,
        features,
        averageFeature,
        timestamp: Date.now(),
      };

      // 保存到数据库
      await emgDatabase.saveTrainingData(training);

      setTrainingData(training);
      setCollectedData([]);
      setCurrentSample(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
    }
  }, [collectedData]);

  return {
    isCollecting,
    currentSample,
    totalSamples: COLLECTION_CONFIG.SAMPLES_PER_COMMAND,
    collectedData,
    trainingData,
    error,
    startCollection,
    stopCollection,
    addData,
    saveTraining,
  };
}
