export interface Feed {
  id: string;
  xsecToken: string;
  modelType: string;
  noteCard: {
    type: string;
    displayTitle: string;
    user: {
      userId: string;
      nickname: string;
      avatar: string;
    };
    interactInfo: {
      liked: boolean;
      likedCount: string;
      collected: boolean;
      collectedCount: string;
      commentCount: string;
    };
    cover: {
      url: string;
      width: number;
      height: number;
    };
  };
}

export interface Comment {
  id: string;
  noteId: string;
  content: string;
  likeCount: string;
  createTime: number;
  ipLocation: string;
  liked: boolean;
  userInfo: {
    userId: string;
    nickname: string;
    avatar: string;
  };
  subCommentCount: string;
  subComments: Comment[];
}

export interface FeedDetail {
  note: {
    noteId: string;
    title: string;
    desc: string;
    type: string;
    time: number;
    ipLocation: string;
    user: {
      userId: string;
      nickname: string;
      avatar: string;
    };
    interactInfo: {
      liked: boolean;
      likedCount: string;
      collected: boolean;
      collectedCount: string;
      commentCount: string;
    };
    imageList: Array<{
      width: number;
      height: number;
      urlDefault: string;
    }>;
  };
  comments: {
    list: Comment[];
    cursor: string;
    hasMore: boolean;
  };
}

export interface UserProfile {
  basicInfo: {
    nickname: string;
    redId: string;
    desc: string;
    gender: number;
    ipLocation: string;
    images: string;
    imageb: string;
  };
  interactions: Array<{
    type: string;
    name: string;
    count: string;
  }>;
  notes: Feed[];
}

export interface SearchFilters {
  sortBy?: '综合' | '最新' | '最多点赞' | '最多评论' | '最多收藏';
  noteType?: '不限' | '视频' | '图文';
  publishTime?: '不限' | '一天内' | '一周内' | '半年内';
  searchScope?: '不限' | '已看过' | '未看过' | '已关注';
  location?: '不限' | '同城' | '附近';
}

export interface CommentConfig {
  clickMoreReplies?: boolean;
  maxRepliesThreshold?: number;
  maxCommentItems?: number;
  scrollSpeed?: 'slow' | 'normal' | 'fast';
}
