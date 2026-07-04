// 侧边栏目录配置
// 仅在文章详情页（桌面端 lg 以上）显示，结构由 MainGridLayout.astro 直接渲染，
// 不再需要 position / tabletSidebar / showBothSidebarsOnPostPage 等复杂配置。
export const sidebarTocConfig = {
	// 是否在文章详情页右侧显示目录
	enable: true,
};