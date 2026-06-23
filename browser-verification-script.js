/**
 * 浏览器 IndexedDB 验证脚本 - 修订版
 * 正确的流程：采集 → 识别反馈 → 保存删除前快照 → 删除指令 → 保存删除后快照 → 对比
 * 在浏览器控制台执行此脚本
 */

// ============ 辅助函数 ============

/**
 * 打开 IndexedDB 数据库
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EMGDatabase');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取指定 store 的所有数据
 */
async function getAllData(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 导出所有 store 的数据
 */
async function exportAllData() {
  const stores = ['commands', 'recognitionRecords', 'feedbackData', 'calibrationData'];
  const result = {};
  
  for (const storeName of stores) {
    result[storeName] = await getAllData(storeName);
  }
  
  return result;
}

/**
 * 打印数据统计
 */
function printStats(data, label) {
  console.log(`\n========== ${label} ==========`);
  console.log(`commands: ${data.commands.length} 条`);
  console.log(`recognitionRecords: ${data.recognitionRecords.length} 条`);
  console.log(`feedbackData: ${data.feedbackData.length} 条`);
  console.log(`calibrationData: ${data.calibrationData.length} 条`);
  
  // 详细显示 commands
  if (data.commands.length > 0) {
    console.log('\n--- Commands 详情 ---');
    data.commands.forEach((cmd, idx) => {
      console.log(`${idx + 1}. key="${cmd.key}", name="${cmd.name}", collections=${cmd.collections?.length || 0}`);
      if (cmd.collections && cmd.collections.length > 0) {
        cmd.collections.forEach((col, colIdx) => {
          console.log(`   - ${colIdx + 1}. id="${col.id}"`);
        });
      }
    });
  }
  
  // 详细显示 recognitionRecords
  if (data.recognitionRecords.length > 0) {
    console.log('\n--- RecognitionRecords 详情 ---');
    data.recognitionRecords.forEach((rec, idx) => {
      console.log(`${idx + 1}. commandName="${rec.commandName}", predictedCommand="${rec.predictedCommand}"`);
    });
  }
  
  // 详细显示 feedbackData
  if (data.feedbackData.length > 0) {
    console.log('\n--- FeedbackData 详情 ---');
    data.feedbackData.forEach((fb, idx) => {
      console.log(`${idx + 1}. commandName="${fb.commandName}", predictedCommand="${fb.predictedCommand}", actualCommand="${fb.actualCommand}"`);
    });
  }
}

/**
 * 保存数据到全局变量供后续对比
 */
let beforeDeleteData = null;
let afterDeleteData = null;

// ============ 修订的验证步骤 ============

/**
 * 步骤 1：采集训练
 * 用户手动操作：创建指令 "test"，采集 5 次，保存
 */
async function step1_collectData() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 1：采集训练                          ║');
  console.log('╚════════════════════════════════════════╝');
  
  console.log('\n📋 请在采集训练页面执行以下操作：');
  console.log('1. 创建指令 "test"');
  console.log('2. 采集 5 次');
  console.log('3. 保存');
  console.log('\n完成后执行：indexedDBVerification.step2_verifyCollectionData()');
}

/**
 * 步骤 2：验证采集数据
 */
async function step2_verifyCollectionData() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 2：验证采集数据                      ║');
  console.log('╚════════════════════════════════════════╝');
  
  const currentData = await exportAllData();
  printStats(currentData, '当前采集数据');
  
  if (currentData.commands.length === 1 && currentData.commands[0].name === 'test') {
    console.log('\n✅ 验证成功：找到指令 "test"');
    console.log(`✅ 采集数量：${currentData.commands[0].collections.length} 条`);
  } else {
    console.log('\n❌ 验证失败：未找到指令 "test"');
    return;
  }
  
  console.log('\n下一步：在默念测试页面进行 3 次识别并提供反馈，然后执行 step3_verifyRecognitionData()');
}

/**
 * 步骤 3：验证识别和反馈数据
 */
async function step3_verifyRecognitionData() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 3：验证识别和反馈数据                ║');
  console.log('╚════════════════════════════════════════╝');
  
  const currentData = await exportAllData();
  printStats(currentData, '当前数据（包含识别和反馈）');
  
  if (currentData.recognitionRecords.length > 0) {
    console.log(`\n✅ 识别记录：${currentData.recognitionRecords.length} 条`);
  } else {
    console.log('\n⚠️  没有识别记录');
  }
  
  if (currentData.feedbackData.length > 0) {
    console.log(`✅ 反馈数据：${currentData.feedbackData.length} 条`);
  } else {
    console.log('\n⚠️  没有反馈数据');
  }
  
  console.log('\n✅ 现在执行 step4_exportBeforeActualDelete() 保存删除前快照');
  console.log('然后在数据管理页面删除指令 "test"');
}

/**
 * 步骤 4：保存删除前快照（关键步骤！）
 * 这是修订后的关键改进：在实际删除前保存完整的数据快照
 */
async function step4_exportBeforeActualDelete() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 4：保存删除前快照（关键步骤）        ║');
  console.log('╚════════════════════════════════════════╝');
  
  beforeDeleteData = await exportAllData();
  printStats(beforeDeleteData, '删除前的完整数据快照');
  
  console.log('\n✅ 删除前快照已保存到 beforeDeleteData 变量');
  console.log('\n📋 现在请在数据管理页面删除指令 "test"');
  console.log('删除完成后执行：indexedDBVerification.step5_exportAfterDelete()');
}

/**
 * 步骤 5：导出删除后的数据
 */
async function step5_exportAfterDelete() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 5：导出删除后的数据                  ║');
  console.log('╚════════════════════════════════════════╝');
  
  afterDeleteData = await exportAllData();
  printStats(afterDeleteData, '删除后的数据');
  
  console.log('\n✅ 删除后快照已保存到 afterDeleteData 变量');
  console.log('下一步：执行 step6_compareData() 对比删除前后的数据');
}

/**
 * 步骤 6：对比和验证（最终验收）
 */
async function step6_compareData() {
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║ 步骤 6：对比和验证（最终验收）            ║');
  console.log('╚════════════════════════════════════════╝');
  
  if (!beforeDeleteData || !afterDeleteData) {
    console.log('❌ 错误：缺少删除前或删除后的数据');
    console.log('请确保已执行 step4_exportBeforeActualDelete() 和 step5_exportAfterDelete()');
    return;
  }
  
  console.log('\n--- 对比结果 ---\n');
  
  // 对比 commands
  console.log('Commands:');
  console.log(`  删除前：${beforeDeleteData.commands.length} 条`);
  console.log(`  删除后：${afterDeleteData.commands.length} 条`);
  if (afterDeleteData.commands.length === 0) {
    console.log('  ✅ 验证通过：commands 已完全删除');
  } else {
    console.log('  ❌ 验证失败：commands 未完全删除');
    console.log(`     剩余数据：${JSON.stringify(afterDeleteData.commands)}`);
  }
  
  // 对比 recognitionRecords
  console.log('\nRecognitionRecords:');
  console.log(`  删除前：${beforeDeleteData.recognitionRecords.length} 条`);
  console.log(`  删除后：${afterDeleteData.recognitionRecords.length} 条`);
  if (afterDeleteData.recognitionRecords.length === 0) {
    console.log('  ✅ 验证通过：recognitionRecords 已完全删除');
  } else {
    console.log('  ❌ 验证失败：recognitionRecords 未完全删除');
    console.log(`     剩余数据：${JSON.stringify(afterDeleteData.recognitionRecords)}`);
  }
  
  // 对比 feedbackData
  console.log('\nFeedbackData:');
  console.log(`  删除前：${beforeDeleteData.feedbackData.length} 条`);
  console.log(`  删除后：${afterDeleteData.feedbackData.length} 条`);
  if (afterDeleteData.feedbackData.length === 0) {
    console.log('  ✅ 验证通过：feedbackData 已完全删除');
  } else {
    console.log('  ❌ 验证失败：feedbackData 未完全删除');
    console.log(`     剩余数据：${JSON.stringify(afterDeleteData.feedbackData)}`);
  }
  
  // 对比 calibrationData
  console.log('\nCalibrationData:');
  console.log(`  删除前：${beforeDeleteData.calibrationData.length} 条`);
  console.log(`  删除后：${afterDeleteData.calibrationData.length} 条`);
  if (afterDeleteData.calibrationData.length === 0) {
    console.log('  ✅ 验证通过：calibrationData 已完全删除');
  } else {
    console.log('  ❌ 验证失败：calibrationData 未完全删除');
    console.log(`     剩余数据：${JSON.stringify(afterDeleteData.calibrationData)}`);
  }
  
  // 总体评分
  console.log('\n--- 总体评分 ---');
  const allPassed = 
    afterDeleteData.commands.length === 0 &&
    afterDeleteData.recognitionRecords.length === 0 &&
    afterDeleteData.feedbackData.length === 0 &&
    afterDeleteData.calibrationData.length === 0;
  
  if (allPassed) {
    console.log('✅ 所有验证通过！删除逻辑正确。');
  } else {
    console.log('❌ 部分验证失败。请检查删除逻辑。');
  }
  
  // 导出完整数据用于报告
  console.log('\n--- 完整数据导出（用于报告） ---');
  console.log('\n【删除前数据】');
  console.log(JSON.stringify(beforeDeleteData, null, 2));
  console.log('\n【删除后数据】');
  console.log(JSON.stringify(afterDeleteData, null, 2));
  
  // 复制到剪贴板
  const reportData = {
    beforeDelete: beforeDeleteData,
    afterDelete: afterDeleteData,
    testResult: allPassed ? '✅ 通过' : '❌ 失败',
    timestamp: new Date().toISOString(),
  };
  
  console.log('\n--- 可复制的报告数据 ---');
  console.log(JSON.stringify(reportData, null, 2));
}

// ============ 导出到全局作用域 ============

window.indexedDBVerification = {
  step1_collectData,
  step2_verifyCollectionData,
  step3_verifyRecognitionData,
  step4_exportBeforeActualDelete,
  step5_exportAfterDelete,
  step6_compareData,
  exportAllData,
  getAllData,
};

console.log('✅ IndexedDB 验证脚本已加载（修订版）');
console.log('\n📋 验证流程：');
console.log('1. indexedDBVerification.step1_collectData() - 采集训练');
console.log('2. 在采集训练页面：创建指令 "test"，采集 5 次，保存');
console.log('3. indexedDBVerification.step2_verifyCollectionData() - 验证采集数据');
console.log('4. 在默念测试页面：进行 3 次识别并提供反馈');
console.log('5. indexedDBVerification.step3_verifyRecognitionData() - 验证识别和反馈数据');
console.log('6. indexedDBVerification.step4_exportBeforeActualDelete() - 保存删除前快照 ⭐');
console.log('7. 在数据管理页面：删除指令 "test"');
console.log('8. indexedDBVerification.step5_exportAfterDelete() - 导出删除后的数据');
console.log('9. indexedDBVerification.step6_compareData() - 对比和验证（最终验收）');
