import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi, usersApi } from '@/api/client'
import { useAuth } from '@/store/auth'
import { Alert, RoleBadge } from '@/components/shared'
import { Camera, Lock, User } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [profileMsg, setProfileMsg] = useState('')

  const changePwdMutation = useMutation({
    mutationFn: () => authApi.changePassword(oldPwd, newPwd),
    onSuccess: () => {
      setSuccess('Password changed successfully.')
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
      setTimeout(() => setSuccess(''), 4000)
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to change password'),
  })

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profileFile) return
      const formData = new FormData()
      formData.append('image', profileFile)
      await usersApi.update(user.id, formData as any)
      const me = await authApi.me()
      localStorage.setItem('auth_user', JSON.stringify(me.data))
    },
    onSuccess: () => {
      setProfileMsg('Profile image updated.')
      setProfileFile(null)
      setTimeout(() => window.location.reload(), 500)
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Failed to update profile image.'),
  })

  const handleSubmit = () => {
    setError('')
    if (newPwd !== confirmPwd) { setError('New passwords do not match.'); return }
    if (newPwd.length < 8) { setError('Password must be at least 8 characters.'); return }
    changePwdMutation.mutate()
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      {/* Profile */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center overflow-hidden">
            {(user as any)?.image ? (
              <img src={(user as any).image} alt={user?.name || 'User'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-lg font-semibold">
                {user?.name?.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <div className="mt-1"><RoleBadge role={user?.role || ''} /></div>
          </div>
        </div>
        {profileMsg && <Alert type="success" message={profileMsg} />}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
        />
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm" onClick={() => fileRef.current?.click()}>
            <Camera className="w-4 h-4" />
            {profileFile ? profileFile.name : 'Choose Profile Photo'}
          </button>
          <button
            className="btn-primary text-sm"
            disabled={!profileFile || profileMutation.isPending}
            onClick={() => profileMutation.mutate()}
          >
            {profileMutation.isPending ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Change Password</h2>
        </div>

        {success && <Alert type="success" message={success} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="label">Current password</label>
          <input
            type="password"
            className="input"
            value={oldPwd}
            onChange={e => { setOldPwd(e.target.value); setError('') }}
            placeholder="Your current password"
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            className="input"
            value={newPwd}
            onChange={e => { setNewPwd(e.target.value); setError('') }}
            placeholder="Min 8 characters"
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            value={confirmPwd}
            onChange={e => { setConfirmPwd(e.target.value); setError('') }}
            placeholder="Repeat new password"
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={changePwdMutation.isPending || !oldPwd || !newPwd || !confirmPwd}
        >
          {changePwdMutation.isPending ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  )
}
