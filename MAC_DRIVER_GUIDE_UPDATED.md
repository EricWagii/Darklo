# Mac 驱动安装指南 - Ear EMG Silent Speech Demo

## 概述

本指南为 macOS 用户提供 STM32 微控制器 USB 串口驱动的完整安装步骤。通过正确安装驱动程序，您的 Mac 将能够识别并与 STM32 设备通信，从而使用 Ear EMG 演示系统进行肌电信号采集和识别。

## 系统要求

| 要求项 | 规格 |
|--------|------|
| 操作系统 | macOS 10.13 或更高版本 |
| 硬件 | Intel Mac 或 Apple Silicon Mac |
| USB 端口 | USB 2.0 或 USB 3.0 |
| 管理员权限 | 需要 |
| 浏览器 | Chrome、Edge（支持 Web Serial API） |

## 驱动程序类型

根据您的 STM32 开发板使用的 USB 接口方式，选择对应的驱动程序：

| 芯片/接口类型 | 驱动程序 | 适用范围 | 特点 |
|---------|---------|--------|------|
| CH340 / CH341 | WCH CH340 驱动 | 常见的低成本开发板 | 需要禁用 SIP |
| CP2102 / CP2104 | Silicon Labs CP210x 驱动 | 专业级开发板 | 安装相对简单 |
| FT232 / FT2232 | FTDI VCP 驱动 | 工业级设备 | 功能完整 |
| **STM32 原生 USB** | **无需额外驱动** | **STM32 内置 USB 设备** | **推荐方案** |

### 重要提示：STM32 原生 USB 串口

如果您的 STM32 开发板使用 **STM32 内置的 USB 设备功能**（而不是外接的 USB 转串口芯片），**无需安装任何驱动程序**。

**识别方法**：
- 在终端中运行 `ls -la /dev/tty.*`
- 如果看到 `/dev/tty.usbmodem*` 或 `/dev/cu.usbmodem*`，说明是 STM32 原生 USB
- 直接在浏览器中使用 Web Serial API 连接即可

## 安装步骤

### 方案 A：CH340 驱动安装（最常见）

#### 1. 下载驱动程序

访问 WCH 官方网站下载 macOS 驱动程序：

- **官方下载链接**：[http://www.wch.cn/downloads/CH341SER_MAC.ZIP](http://www.wch.cn/downloads/CH341SER_MAC.ZIP)
- **备用下载链接**：[GitHub - WCH-CH340 Drivers](https://github.com/WCH-Semiconductor/ch340-driver)

#### 2. 解压文件

下载完成后，双击 ZIP 文件进行解压。您将看到一个名为 `CH341SER_MAC` 的文件夹。

#### 3. 禁用系统完整性保护（SIP）

**注意**：此步骤仅在 macOS 10.11 或更高版本上需要。

1. 重启 Mac，按住 **Command + R** 进入恢复模式
2. 打开"实用工具"菜单，选择"终端"
3. 输入以下命令：

```bash
csrutil disable
```

4. 按 Enter 键，然后重启 Mac

#### 4. 安装驱动程序

1. 打开解压后的 `CH341SER_MAC` 文件夹
2. 双击 `CH341SER_MAC.pkg` 文件
3. 按照安装向导完成安装
4. 输入管理员密码（如果提示）
5. 安装完成后重启 Mac

#### 5. 重新启用系统完整性保护

1. 重启 Mac，按住 **Command + R** 进入恢复模式
2. 打开"实用工具"菜单，选择"终端"
3. 输入以下命令：

```bash
csrutil enable
```

4. 按 Enter 键，然后重启 Mac

### 方案 B：Silicon Labs CP210x 驱动安装

#### 1. 下载驱动程序

访问 Silicon Labs 官方网站：

- **官方下载链接**：[https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)

选择 macOS 版本的驱动程序下载。

#### 2. 安装驱动程序

1. 双击下载的 `.dmg` 文件
2. 在弹出的窗口中，双击 `.pkg` 安装程序
3. 按照安装向导完成安装
4. 输入管理员密码（如果提示）
5. 重启 Mac

### 方案 C：FTDI VCP 驱动安装

#### 1. 下载驱动程序

访问 FTDI 官方网站：

- **官方下载链接**：[https://ftdichip.com/drivers/vcp-drivers/](https://ftdichip.com/drivers/vcp-drivers/)

选择macOS 版本的驱动程序下载。

#### 2. 安装驱动程序

1. 双击下载的 `.dmg` 文件
2. 在弹出的窗口中，双击 `.pkg` 安装程序
3. 按照安装向导完成安装
4. 输入管理员密码（如果提示）
5. 重启 Mac

### 方案 D：STM32 原生 USB（推荐 - 无需驱动）

如果您的 STM32 开发板使用原生 USB 接口，**无需安装任何驱动程序**。

**验证方法**：

1. 将 STM32 设备通过 USB 连接到 Mac
2. 打开终端，运行以下命令：

```bash
ls -la /dev/tty.* | grep -i usb
```

3. 如果看到输出（如 `/dev/tty.usbmodem8D7C589754511`），说明设备已被识别

## 验证驱动安装

### 方法 1：通过系统信息检查

1. 点击左上角的 Apple 菜单
2. 选择"关于本机"
3. 点击"系统报告..."
4. 在左侧菜单中选择"USB"
5. 查看 USB 设备列表中是否出现您的 STM32 设备

### 方法 2：通过终端检查

打开终端，输入以下命令查看串口设备：

```bash
ls -la /dev/tty.*
```

如果驱动安装成功，您应该看到类似以下的输出：

```
/dev/tty.usbserial-XXXXXXXX
/dev/cu.usbserial-XXXXXXXX
/dev/tty.usbmodem8D7C589754511
/dev/cu.usbmodem8D7C589754511
```

其中 `XXXXXXXX` 是设备的序列号。

### 方法 3：在 Ear EMG 应用中测试

1. 打开 Ear EMG 演示系统：[https://earemgdemo-bncphs6o.manus.space](https://earemgdemo-bncphs6o.manus.space)
2. 将 STM32 设备通过 USB 连接到 Mac
3. 导航到"采集训练"页面
4. 点击"连接设备"按钮
5. 在弹出的串口选择对话框中选择您的设备
6. 如果连接成功，页面顶部会显示"✓ 已连接"

## 硬件通信规格

### 通信参数

| 参数 | 值 |
|------|-----|
| 波特率 | 115200 bps |
| 数据位 | 8 |
| 停止位 | 1 |
| 校验位 | 无 |
| 流控 | 无 |

### 数据格式

STM32 通过 USB 串口发送的数据为**二进制格式**，每个数据包包含：

```
[0xFF] [CH1_H] [CH1_L] [CH2_H] [CH2_L] [CH3_H] [CH3_L] [checksum]
```

其中：
- `0xFF` - 同步字节（数据包开始标记）
- `CH1_H/L` - 通道 1 的高字节和低字节（16 位有符号整数）
- `CH2_H/L` - 通道 2 的高字节和低字节
- `CH3_H/L` - 通道 3 的高字节和低字节
- `checksum` - 校验字节

**采样率**：250 Hz（每 4ms 发送一个数据包）

## 常见问题解决

### 问题 1：驱动安装后仍无法识别设备

**解决方案**：

1. 重启 Mac
2. 尝试使用不同的 USB 端口
3. 使用不同的 USB 数据线
4. 检查设备管理器中是否显示"未知设备"
5. 重新安装驱动程序
6. 对于 STM32 原生 USB，检查设备固件是否正确配置

### 问题 2：收到"无法打开软件包"的错误

**解决方案**：

1. 打开"系统偏好设置" → "安全性与隐私"
2. 在"通用"选项卡中，点击"仍要打开"按钮
3. 或者，右键单击 `.pkg` 文件，选择"打开"

### 问题 3：系统提示"无法验证开发者"

**解决方案**：

1. 打开"系统偏好设置" → "安全性与隐私"
2. 在"通用"选项卡中，选择"允许来自任何地方的应用"
3. 如果该选项不可用，可以在终端中执行：

```bash
sudo spctl --master-disable
```

### 问题 4：安装后应用仍显示"设备未连接"

**解决方案**：

1. 确保 STM32 设备已通过 USB 连接
2. 检查设备是否已正确供电
3. 在终端中运行以下命令检查设备是否被识别：

```bash
ioreg -p IOUSB -l -w 0 | grep -A 5 "STM32\|CH340\|CP210x\|FTDI"
```

4. 如果设备出现在列表中，驱动已正确安装
5. 尝试刷新浏览器页面或重新启动应用
6. 检查浏览器是否支持 Web Serial API（Chrome、Edge 推荐）

### 问题 5：Mac 提示"系统扩展被阻止"

**解决方案**：

1. 打开"系统偏好设置" → "安全性与隐私" → "通用"
2. 查看是否有关于被阻止的系统扩展的提示
3. 点击"允许"按钮
4. 重启 Mac

### 问题 6：Web Serial API 连接失败

**解决方案**：

1. 确保使用 Chrome、Edge 或其他支持 Web Serial API 的浏览器
2. 确保网站使用 HTTPS 连接（Web Serial API 需要安全上下文）
3. 检查浏览器权限设置，允许访问串口设备
4. 尝试在浏览器地址栏中输入 `chrome://flags` 搜索 "serial"，确保相关功能已启用

## 卸载驱动程序

如果需要卸载驱动程序，请按照以下步骤操作：

### CH340 驱动卸载

打开终端，输入以下命令：

```bash
sudo rm -rf /Library/Extensions/usbserial.kext
sudo rm -rf /System/Library/Extensions/usbserial.kext
```

然后重启 Mac。

### Silicon Labs CP210x 驱动卸载

打开终端，输入以下命令：

```bash
sudo rm -rf /Library/Extensions/SiLabsUSBDriver.kext
sudo rm -rf /System/Library/Extensions/SiLabsUSBDriver.kext
```

然后重启 Mac。

### FTDI 驱动卸载

打开终端，输入以下命令：

```bash
sudo rm -rf /Library/Extensions/FTDIUSBSerialDriver.kext
sudo rm -rf /System/Library/Extensions/FTDIUSBSerialDriver.kext
```

然后重启 Mac。

## 使用 Ear EMG 应用

驱动程序安装完成后，您可以开始使用 Ear EMG 演示系统：

### 采集训练流程

1. 打开应用并导航到"采集训练"页面
2. 点击"连接设备"按钮连接 STM32 设备
3. 在弹出的对话框中选择您的设备
4. 输入要采集的指令名称（例如："开始"、"停止"等）
5. 点击"开始采集"按钮
6. 默念指令约 2-3 秒
7. 点击"停止采集"按钮
8. 系统将自动检测有效部分并显示三层波形：
   - **Raw（原始波形）** - 灰色线条，未经处理的原始肌电信号
   - **Filtered（滤波波形）** - 蓝色线条，经过带通滤波的信号
   - **Envelope（包络波形）** - 黄色线条，信号的包络（能量）
9. 可手动调整裁剪范围，确认后点击"确认"
10. 重复采集 5 次以上以建立特征库
11. 点击"保存数据"完成采集

### 识别测试流程

1. 导航到"默念测试"页面
2. 确保硬件已连接
3. 点击"开始识别"按钮
4. 等待倒计时完成
5. 默念任意指令（必须是已采集过的指令）
6. 点击"停止识别"按钮
7. 系统将显示识别结果、置信度和所有指令的得分排名

## 技术支持

如遇到驱动安装或使用问题，请：

1. 查阅本指南的"常见问题解决"部分
2. 访问 STM32 芯片制造商的官方网站获取最新驱动程序
3. 查看 Ear EMG 应用的调试页面（`/debug`）获取实时设备信息
4. 查看浏览器控制台（F12 → Console）获取详细错误信息
5. 联系技术支持团队

## 参考资源

- **WCH CH340 驱动**：[http://www.wch.cn/downloads/CH341SER_MAC.ZIP](http://www.wch.cn/downloads/CH341SER_MAC.ZIP)
- **Silicon Labs CP210x 驱动**：[https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
- **FTDI VCP 驱动**：[https://ftdichip.com/drivers/vcp-drivers/](https://ftdichip.com/drivers/vcp-drivers/)
- **Apple 系统完整性保护**：[https://support.apple.com/en-us/HT204899](https://support.apple.com/en-us/HT204899)
- **macOS 安全性与隐私**：[https://support.apple.com/en-us/HT202491](https://support.apple.com/en-us/HT202491)
- **Web Serial API 文档**：[https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)

## 许可证

本指南由 Manus AI 编写，适用于 Ear EMG Silent Speech Demo 项目。

---

**最后更新**：2026 年 5 月 14 日  
**版本**：1.1  
**作者**：Manus AI
