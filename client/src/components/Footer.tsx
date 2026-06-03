/**
 * 页脚组件
 * 显示公司信息和版权
 */

export default function Footer() {
  return (
    <footer className="border-t border-border/20 bg-black/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* 公司信息 */}
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-400">
              <span className="font-montserrat font-semibold text-gray-300">Wagii Technology LLC</span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Ear EMG Silent Speech Recognition System
            </p>
          </div>

          {/* 版权信息 */}
          <div className="text-center text-xs text-gray-500">
            <p>© {new Date().getFullYear()} Wagii Technology LLC. All rights reserved.</p>
          </div>

          {/* 链接 */}
          <div className="flex gap-6 text-xs text-gray-400">
            <a href="#" className="hover:text-gray-200 transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-gray-200 transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-gray-200 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
