import type { BaseEntity, CommentType } from "./common"

export interface TaskComment extends BaseEntity {
  task_id: number
  user_id: number
  comment_type: CommentType
  comment_text: string
}

export interface TaskCommentWithDetails extends TaskComment {
  user: {
    id: number
    full_name: string
    avatar_url?: string
    role: string
  }
  task: {
    id: number
    title: string
  }
}

export interface CreateCommentData {
  task_id: number
  comment_type: CommentType
  comment_text: string
}

export interface UpdateCommentData {
  comment_type?: CommentType
  comment_text?: string
}

export interface CommentResponse extends TaskComment {
  is_internal: boolean;
  parent_comment_id?: number;
  author_name?: string;
  avatar_url?: string;
}
