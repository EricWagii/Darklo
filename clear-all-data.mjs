/**
 * 永久清空所有IndexedDB数据的脚本
 * 这个脚本会清空所有存储的数据库对象
 */

import fs from 'fs';
import path from 'path';

// 创建一个HTML文件，在浏览器中运行清空操作
const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>清空所有数据</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #f0f0f0; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        .status { margin: 20px 0; padding: 10px; background: #e3f2fd; border-radius: 4px; }
        .success { background: #c8e6c9; color: #2e7d32; }
        .error { background: #ffcdd2; color: #c62828; }
        button { padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #d32f2f; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🗑️ 永久清空所有数据</h1>
        <p>这个工具将清空IndexedDB中的所有数据，包括：</p>
        <ul>
            <li>所有采集指令和波形数据</li>
            <li>所有训练数据</li>
            <li>所有会话数据</li>
            <li>所有识别记录</li>
            <li>所有localStorage缓存</li>
        </ul>
        <button onclick="clearAllData()">点击确认清空所有数据</button>
        <div id="status"></div>
    </div>

    <script>
        async function clearAllData() {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '<div class="status">正在清空数据...</div>';
            
            try {
                // 清空所有IndexedDB数据库
                const dbs = await indexedDB.databases();
                console.log('找到的数据库:', dbs);
                
                for (const dbInfo of dbs) {
                    console.log('正在删除数据库:', dbInfo.name);
                    await new Promise((resolve, reject) => {
                        const request = indexedDB.deleteDatabase(dbInfo.name);
                        request.onsuccess = () => {
                            console.log('数据库已删除:', dbInfo.name);
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                }
                
                // 清空localStorage
                console.log('正在清空localStorage...');
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.includes('emg') || key.includes('command') || key.includes('recognition'))) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => {
                    localStorage.removeItem(key);
                    console.log('已删除localStorage键:', key);
                });
                
                // 清空sessionStorage
                console.log('正在清空sessionStorage...');
                sessionStorage.clear();
                
                statusDiv.innerHTML = '<div class="status success">✅ 所有数据已永久清空！<br/>页面将在3秒后刷新...</div>';
                
                setTimeout(() => {
                    location.reload();
                }, 3000);
                
            } catch (error) {
                console.error('清空数据时出错:', error);
                statusDiv.innerHTML = '<div class="status error">❌ 清空数据失败: ' + error.message + '</div>';
            }
        }
        
        // 页面加载时显示数据库信息
        window.addEventListener('load', async () => {
            try {
                const dbs = await indexedDB.databases();
                console.log('IndexedDB数据库列表:', dbs);
                
                // 检查emg-database
                const request = indexedDB.open('emg-database', 1);
                request.onsuccess = () => {
                    const db = request.result;
                    console.log('emg-database 存储对象:', Array.from(db.objectStoreNames));
                    db.close();
                };
            } catch (error) {
                console.error('获取数据库信息失败:', error);
            }
        });
    </script>
</body>
</html>`;

// 写入HTML文件到项目public目录
const publicDir = path.join(process.cwd(), 'client', 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

const filePath = path.join(publicDir, 'clear-data.html');
fs.writeFileSync(filePath, htmlContent);

console.log('✅ 清空数据工具已生成');
console.log('📍 文件位置:', filePath);
console.log('🌐 访问地址: http://localhost:3000/clear-data.html');
console.log('\n使用方法:');
console.log('1. 打开浏览器访问上述地址');
console.log('2. 点击"点击确认清空所有数据"按钮');
console.log('3. 等待数据清空完成，页面会自动刷新');
