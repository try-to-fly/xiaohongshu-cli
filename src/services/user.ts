import type { Page } from 'playwright';
import { waitForInitialState, waitForStateData } from '../utils/state.js';
import type { UserProfile } from '../types/index.js';

export async function getUserProfile(
  page: Page,
  userId: string,
  xsecToken: string
): Promise<UserProfile> {
  const url = `https://www.xiaohongshu.com/user/profile/${userId}?xsec_token=${xsecToken}&xsec_source=pc_note`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await waitForInitialState(page);

  // 等待用户数据加载
  await waitForStateData(page, 'state?.user?.userPageData', 10000);

  const profile = await page.evaluate(() => {
    const state = (window as any).__INITIAL_STATE__;

    const userPageData = state?.user?.userPageData;
    const userData =
      userPageData?._rawValue ?? userPageData?._value ?? userPageData?.value;

    const notes = state?.user?.notes;
    const notesData = notes?._rawValue ?? notes?._value ?? notes?.value ?? [];

    return {
      basicInfo: userData?.basicInfo || {},
      interactions: userData?.interactions || [],
      notes: Array.isArray(notesData) ? notesData.flat() : [],
    };
  });

  return profile;
}
