/**
 * RecognitionMode.tsx 中 handleSubmitFeedback 函数的完整实现
 * 包含反馈纠偶系统的集成
 */

const handleSubmitFeedback = () => {
  if (!selectedTrueCommand || !lastRecognitionResult) return;

  try {
    // 1. 计算相似度和置信度
    const similarity = lastRecognitionResult.confidence;
    const confidence = lastRecognitionResult.confidence;
    
    // 2. 加载已保存的指令模板
    const templates = savedCommands.map(cmd => ({
      commandName: cmd.name,
      meanFeatureVector: [], // 这里应该从存储中加载实际的特征向量
    }));
    
    // 3. 调用反馈纠偶系统
    const calibrationRecord = processRecognitionFeedback(
      lastRecognitionResult.command,
      selectedTrueCommand,
      similarity,
      confidence,
      templates as any
    );
    
    // 4. 记录用户反馈
    const feedbackRecord = submitUserFeedback({
      predictedCommand: lastRecognitionResult.command,
      predictedSimilarity: similarity,
      predictedConfidence: confidence,
      trueCommand: selectedTrueCommand,
      isCorrect: lastRecognitionResult.command === selectedTrueCommand,
      topMatches: lastRecognitionResult.allScores,
      timestamp: Date.now(),
    });
    
    // 5. 更新自适应阈值
    const isCorrect = lastRecognitionResult.command === selectedTrueCommand;
    if (isCorrect) {
      // 识别正确，降低阈值（更容易识别）
      const newThreshold = Math.max(0.5, adaptiveThreshold - 0.05);
      setAdaptiveThreshold(newThreshold);
    } else {
      // 识别错误，提高阈值（更严格）
      const newThreshold = Math.min(0.95, adaptiveThreshold + 0.05);
      setAdaptiveThreshold(newThreshold);
    }
    
    // 6. 计算性能指标
    const metrics = calculatePerformanceMetrics();
    console.log('识别性能指标:', metrics);
    
    // 7. 保存反馈记录到历史
    const historyRecord = {
      ...lastRecognitionResult,
      userCorrection: selectedTrueCommand,
      isCorrect,
      calibrationApplied: calibrationRecord.adjustmentApplied,
      timestamp: new Date(),
    };
    
    setRecognitionHistory([historyRecord as any, ...recognitionHistory]);
    
    // 8. 显示反馈结果
    setError(null);
    
  } catch (err) {
    console.error('反馈处理失败:', err);
    setError(`反馈处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
  }
  
  // 关闭反馈面板
  setShowFeedback(false);
  setLastRecognitionResult(null);
  setSelectedTrueCommand('');
};
