import type { Page } from 'playwright';
import type { UserProfile } from '../types/index.js';

export async function getUserProfile(
  page: Page,
  userId: string,
  xsecToken: string
): Promise<UserProfile> {
  const url = `https://www.xiaohongshu.com/user/profile/${userId}?xsec_token=${xsecToken}&xsec_source=pc_note`;
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => (window as any).__INITIAL_STATE__ !== undefined);

  const profile = await page.evaluate(() => {
    const state = (window as any).__INITIAL_STATE__;

    const userPageData = state?.user?.userPageData;
    const userData =
      userPageData?.value ?? userPageData?._value ?? userPageData?._rawValue;

    const notes = state?.user?.notes;
    const notesData = notes?.value ?? notes?._value ?? [];

    return {
      basicInfo: userData?.basicInfo || {},
      interactions: userData?.interactions || [],
      notes: Array.isArray(notesData) ? notesData.flat() : [],
    };
  });

  return profile;
}
