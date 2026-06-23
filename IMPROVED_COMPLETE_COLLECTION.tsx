  // 完成采集 - 自动进行全部裁剪（改进版本）
  const handleCompleteCollection = () => {
    if (!currentUser) {
      toast.error('请先登录');
      return;
    }

    if (collectionHistory.length < 5) {
      setError('至少需要采集 5 次');
      return;
    }

    try {
      console.log('[AutoCrop] 开始自动裁剪所有采集...');
      setError(null);
      
      // 显示裁剪进度
      toast.loading('正在自动裁剪采集数据...');

      // 改进 1：使用正确的采样率（500Hz）
      const alignment = alignMultipleCollectionsAfterPreprocessing(
        collectionHistory.map((col) => col.waveform),
        SAMPLE_RATE  // 采样率 500Hz
      );

      // 检查裁剪结果是否有效
      if (alignment.startIdx >= alignment.endIdx) {
        toast.dismiss();
        setError('无法识别有效波形，请检查采集数据质量');
        return;
      }

      // 对所有采集进行裁剪
      const croppedHistory = collectionHistory.map((col) => ({
        ...col,
        waveform: {
          ch1: col.waveform.ch1.slice(alignment.startIdx, alignment.endIdx),
          ch2: col.waveform.ch2.slice(alignment.startIdx, alignment.endIdx),
          ch3: col.waveform.ch3.slice(alignment.startIdx, alignment.endIdx),
        },
        trimStart: alignment.startIdx,
        trimEnd: alignment.endIdx,
      }));

      // 检查裁剪后的数据是否有效
      const validCrops = croppedHistory.filter((col) => col.waveform.ch2.length > 10);
      if (validCrops.length === 0) {
        toast.dismiss();
        setError('裁剪后没有有效数据，请重新采集');
        return;
      }

      // 改进 2：添加长度验证
      const firstCropDurationMs = calculateDurationMs(validCrops[0].waveform.ch1.length);
      const validation = validateInstructionLength(commandName, firstCropDurationMs);
      
      if (!validation.isValid) {
        toast.dismiss();
        setError(`⚠️ 裁剪后的波形不符合规范：${validation.message}`);
        return;
      }

      // 改进 3：显示时长信息和推荐值
      const spec = getInstructionSpec(commandName);
      const recommendedMsg = spec ? `（推荐：${spec.recommendedDurationMs}ms）` : '';

      console.log(`[AutoCrop] 裁剪完成: ${validCrops.length}/${collectionHistory.length}`);
      console.log(`[AutoCrop] 裁剪后时长: ${firstCropDurationMs.toFixed(0)}ms ${recommendedMsg}`);
      console.log(`[AutoCrop] 有效片段比例: ${(alignment.confidence * 100).toFixed(1)}%`);
      console.log(`[AutoCrop] SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`);

      // 改进 4：自动调整参数以符合指令长度规范
      // 检查是否需要调整固定长度参数
      let adjustmentMsg = '';
      if (firstCropDurationMs < 150) {
        adjustmentMsg = '\n⚠️ 提示：采集时间较短，建议放慢发音速度';
      } else if (firstCropDurationMs > 600) {
        adjustmentMsg = '\n⚠️ 提示：采集时间较长，建议加快发音速度';
      }

      // 为每个采集添加用户信息
      const collectionsWithUser = validCrops.map(col => ({
        ...col,
        userId: currentUser.userId,
        userName: currentUser.userName,
      }));

      // 保存到 localStorage
      const newCommand: StoredCommand = {
        name: commandName,
        collections: collectionsWithUser,
        createdAt: new Date(),
      };

      const existingIndex = savedCommands.findIndex((cmd) => cmd.name === commandName);
      let updated: StoredCommand[];

      if (existingIndex >= 0) {
        // 追加到已有指令
        updated = [...savedCommands];
        updated[existingIndex].collections.push(...collectionsWithUser);
      } else {
        // 新建指令
        updated = [...savedCommands, newCommand];
      }

      setSavedCommands(updated);
      localStorage.setItem('emg-commands', JSON.stringify(updated));

      // 显示成功提示
      const snrInfo = `SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`;
      const successMsg = `✓ 指令 "${commandName}" 已保存！
采集次数：${validCrops.length}
裁剪后时长：${firstCropDurationMs.toFixed(0)}ms ${recommendedMsg}
有效片段比例：${(alignment.confidence * 100).toFixed(1)}%
${snrInfo}

所有采集已自动裁剪，数据质量已保证。${adjustmentMsg}`;
      
      toast.dismiss();
      toast.success('采集数据已保存');
      alert(successMsg);

      // 重置状态，清空页面以便继续采集下一个指令
      setCommandName('');
      setCollectionHistory([]);
      setCollectionCount(0);
      setError(null);
      setShowConfirm(false);
      setConfirmAction(null);
      setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
      setCollectionTime(0);
      setShowTrimUI(false);
      setTrimStart(0);
      setTrimEnd(0);
      setPendingWaveform(null);
      setIsAppendingMode(false);
    } catch (err) {
      console.error('[AutoCrop] 自动裁剪失败:', err);
      toast.dismiss();
      setError(`自动裁剪失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };
