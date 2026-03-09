export type E2EDevice = {
  device_id: string
  user_id: string
  identity_key: string
  updated_at: string
}

export type E2EDeviceSummary = {
  device_id: string
  identity_key: string
}

export type E2EPreKeyBundle = {
  user_id: string
  device_id: string
  identity_key: string
  signed_prekey: {
    key_id: number
    public_key: string
    signature: string
  }
  one_time_prekey?: {
    key_id: number
    public_key: string
  }
}

export type E2EUserKeyBackup = {
  user_id: string
  alg: string
  kdf: string
  salt: string
  params: unknown
  ciphertext: string
  updated_at: string
}
