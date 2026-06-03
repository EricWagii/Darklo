/**
 * 演示模式页面
 * 
 * 为没有硬件的用户提供完整的演示体验
 * 包括预加载示例数据和模拟识别流程
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertCircle,
  ChevronLeft,
  Zap,
  CheckCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { generateDemoData, hasDemoData, clearDemoData } from '@/lib/demo-data';
import { PREDEFINED_COMMANDS } from '@/../../shared/const';

export default function DemoMode() {
  const [, setLocation] = useLocation();
  const [demoPhase, setDemoPhase] = useState<
    'idle' | 'loading' | 'ready' | 'recognizing' | 'result'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 检查演示数据
  useEffect(() => {
    const checkDemoData = async () => {
      try {
        const has = await hasDemoData();
        setIsInitialized(has);
      } catch (err) {
        console.error('检查演示数据失败:', err);
      }
    };

    checkDemoData();
  }, []);

  const handleInitializeDemo = async () => {
    try {
      setError(null);
      setDemoPhase('loading');

      await generateDemoData();
      setIsInitialized(true);
      setDemoPhase('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : '初始化失败';
      setError(message);
      setDemoPhase('idle');
    }
  };

  const handleStartDemo = async () => {
    try {
      setError(null);
      setDemoPhase('recognizing');

      // 模拟识别过程
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 随机选择一个识别结果
      const randomCommand =
        PREDEFINED_COMMANDS[
          Math.floor(Math.random() * PREDEFINED_COMMANDS.length)
        ];
      const confidence = 0.75 + Math.random() * 0.2; // 75-95% 置信度

      const demoResult = {
        recognizedCommand: randomCommand.name,
        confidence,
        timestamp: Date.now(),
      };

      setResult(demoResult);
      setHistory((prev) => [demoResult, ...prev.slice(0, 9)]);
      setDemoPhase('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : '演示失败';
      setError(message);
      setDemoPhase('ready');
    }
  };

  const handleContinueDemo = () => {
    setDemoPhase('ready');
    setResult(null);
  };

  const handleResetDemo = async () => {
    try {
      setError(null);
      await clearDemoData();
      setIsInitialized(false);
      setDemoPhase('idle');
      setHistory([]);
      setResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '重置失败';
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className="text-gray-600"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-semibold text-gray-900">演示模式</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Initialization Phase */}
        {!isInitialized && demoPhase === 'idle' && (
          <div className="max-w-2xl mx-auto">
            <Card className="p-12 text-center">
              <div className="mb-6">
                <Zap className="w-16 h-16 mx-auto text-blue-500 opacity-80" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                演示模式
              </h2>

              <p className="text-gray-600 mb-8">
                无需硬件即可体验完整的肌电信号识别流程。系统将加载示例数据，模拟真实的采集和识别过程。
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
                <h3 className="font-semibold text-gray-900 mb-4">演示包含：</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>10 条指令的预训练数据</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>实时识别演示</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>识别历史记录</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>数据导出功能</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={handleInitializeDemo}
                className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                开始演示
              </Button>
            </Card>
          </div>
        )}

        {/* Loading Phase */}
        {demoPhase === 'loading' && (
          <div className="max-w-2xl mx-auto">
            <Card className="p-12 text-center">
              <div className="mb-6">
                <Zap className="w-16 h-16 mx-auto text-blue-500 animate-pulse" />
              </div>
              <p className="text-gray-700 mb-4">正在加载演示数据...</p>
              <div className="flex justify-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse delay-100"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse delay-200"></div>
              </div>
            </Card>
          </div>
        )}

        {/* Ready Phase */}
        {isInitialized && (demoPhase === 'ready' || demoPhase === 'recognizing' || demoPhase === 'result') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Control Panel */}
            <div className="lg:col-span-1">
              <Card className="p-6 sticky top-24">
                <h2 className="text-lg font-semibold text-gray-900 mb-6">
                  演示控制
                </h2>

                <Button
                  onClick={handleStartDemo}
                  disabled={demoPhase === 'recognizing'}
                  className="w-full bg-green-500 hover:bg-green-600 text-white mb-6 py-6 text-lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  开始识别
                </Button>

                <Button
                  onClick={handleResetDemo}
                  variant="outline"
                  className="w-full mb-6"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  重置演示
                </Button>

                <div className="space-y-4 text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-gray-900 mb-2">
                      可用指令
                    </p>
                    <div className="space-y-1">
                      {PREDEFINED_COMMANDS.map((cmd) => (
                        <p
                          key={cmd.id}
                          className="text-xs text-gray-600 flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                          {cmd.name}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-600 mt-4">
                  💡 演示数据已预加载，点击"开始识别"进行演示
                </p>
              </Card>
            </div>

            {/* Result Display */}
            {demoPhase === 'result' && result && (
              <div className="lg:col-span-1">
                <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-0">
                  <div className="text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-gray-900 mb-6">
                      识别完成
                    </p>

                    <div className="bg-white rounded-lg p-6 mb-6">
                      <p className="text-sm text-gray-600 mb-3">识别结果</p>
                      <p className="text-3xl font-bold text-green-600 mb-6">
                        {result.recognizedCommand}
                      </p>
                      <div className="flex items-center justify-center gap-4">
                        <div>
                          <p className="text-xs text-gray-600 mb-2">置信度</p>
                          <p className="text-2xl font-semibold text-gray-900">
                            {(result.confidence * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div
                          className={`w-14 h-14 rounded-full flex items-center justify-center ${
                            result.confidence > 0.8
                              ? 'bg-green-100'
                              : result.confidence > 0.6
                              ? 'bg-yellow-100'
                              : 'bg-red-100'
                          }`}
                        >
                          <span
                            className={`text-sm font-bold ${
                              result.confidence > 0.8
                                ? 'text-green-600'
                                : result.confidence > 0.6
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {result.confidence > 0.8
                              ? '优'
                              : result.confidence > 0.6
                              ? '中'
                              : '低'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleContinueDemo}
                      className="w-full bg-green-500 hover:bg-green-600"
                    >
                      继续演示
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* History */}
            <div className="lg:col-span-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">
                识别历史
              </h2>

              {history.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-gray-600">暂无识别记录</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {history.map((item, index) => (
                    <Card
                      key={index}
                      className="p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-600">
                            #{history.length - index}
                          </span>
                          <p className="font-semibold text-gray-900">
                            {item.recognizedCommand}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {(item.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          item.confidence > 0.8
                            ? 'bg-green-100 text-green-600'
                            : item.confidence > 0.6
                            ? 'bg-yellow-100 text-yellow-600'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {item.confidence > 0.8
                          ? '优'
                          : item.confidence > 0.6
                          ? '中'
                          : '低'}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
