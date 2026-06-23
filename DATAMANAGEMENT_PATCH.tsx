  // 从 localStorage 加载数据
  useEffect(() => {
    const saved = localStorage.getItem('emg-commands');
    if (saved) {
      const parsed = JSON.parse(saved);
      const commands = parsed.map((cmd: any) => ({
        ...cmd,
        accuracy: 70 + Math.random() * 25, // 模拟准确率
      }));
      setCommandsData(commands);
      
      // 计算长度分布统计
      const stats = new Map<string, LengthDistributionStats>();
      commands.forEach((cmd: CommandData) => {
        stats.set(cmd.name, analyzeLengthDistribution(cmd.name, cmd.collections));
      });
      setLengthStats(stats);
    }
  }, []);
