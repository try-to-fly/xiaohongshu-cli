import type { Page } from 'playwright';

/**
 * 从 Vue 3 响应式对象中提取原始值
 * 优先级: _rawValue > _value > value > 原值
 */
export function unwrapVueRef<T>(ref: any, defaultValue: T): T {
  if (ref === null || ref === undefined) {
    return defaultValue;
  }
  return ref._rawValue ?? ref._value ?? ref.value ?? ref ?? defaultValue;
}

/**
 * 等待 __INITIAL_STATE__ 加载完成
 */
export async function waitForInitialState(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);
}

/**
 * 等待 __INITIAL_STATE__ 中指定路径的数据加载完成
 * @param page Playwright Page 对象
 * @param pathGetter 获取数据的路径函数字符串，如 "state?.search?.feeds"
 * @param timeout 超时时间（毫秒），默认 10000
 * @returns 是否成功等待到数据
 */
export async function waitForStateData(
  page: Page,
  pathGetter: string,
  timeout: number = 10000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (path: string) => {
        const state = (window as any).__INITIAL_STATE__;
        if (!state) return false;
        // 使用 Function 构造器来执行路径获取
        const getData = new Function('state', `return ${path}`);
        const target = getData(state);
        if (!target) return false;
        const data = target._rawValue ?? target._value ?? target.value ?? target;
        return Array.isArray(data) ? data.length > 0 : !!data;
      },
      pathGetter,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}
