export type SearchUserResult = {
  id: string
  email: string
  username: string
  first_name: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export type SearchChatResult = {
  id: string
  title: string
  kind: string
  public_slug?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export type SearchResults = {
  users: SearchUserResult[]
  chats: SearchChatResult[]
}
