/**
 * 简化的主网格布局配置
 *
 * 仅保留：内容区 + 文章详情页桌面端右侧目录。
 * 移动端 (<lg) 单列布局；桌面端 (lg+) 双列布局 [内容 1fr | 目录 17.5rem]。
 */
export interface SimpleGridConfig {
	tocEnabled: boolean;
}

export function getMainGridClasses(config: SimpleGridConfig): string {
	const baseClasses = [
		"transition",
		"duration-700",
		"w-full",
		"left-0",
		"right-0",
		"mx-auto",
		"gap-4",
		"px-2",
		"md:px-4",
	];

	if (config.tocEnabled) {
		baseClasses.push("grid", "grid-cols-1", "lg:grid-cols-[1fr_17.5rem]");
	} else {
		baseClasses.push("block", "w-full");
	}

	return baseClasses.join(" ");
}

/**
 * 主内容区 (含 #swup-container) 的网格类。
 */
export function getMainContentClasses(tocEnabled: boolean): string {
	const classes = ["transition-main", "min-w-0", "overflow-hidden"];

	if (tocEnabled) {
		classes.push("col-span-1", "lg:col-start-1");
	}

	return classes.join(" ");
}

/**
 * 右侧目录容器类（仅 lg 及以上显示）。
 */
export function getTocColumnClasses(): string {
	return [
		"hidden",
		"lg:block",
		"lg:col-start-2",
		"lg:row-start-1",
		"lg:max-w-70",
		"onload-animation",
	].join(" ");
}