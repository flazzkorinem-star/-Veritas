'use client'

import { MaterialLibrary } from './_components/MaterialLibrary'
import { useMaterialLibrary } from './_hooks/useMaterialLibrary'

export default function Home() {
  const library = useMaterialLibrary()

  return (
    <MaterialLibrary
      records={library.records}
      loading={library.loading}
      uploading={library.uploading}
      uploadProgress={library.uploadProgress}
      uploadMessage={library.uploadMessage}
      error={library.error}
      onFiles={library.handleFiles}
      onOpenRecord={library.handleOpenRecord}
      onPin={library.handlePin}
      onRename={library.handleRename}
      onDelete={library.handleDelete}
    />
  )
}
