"use client"

import * as React from "react"
import Image from "next/image"
import { IconCommand, IconTrash, IconUpload } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"

interface LogoUploaderProps {
  value?: string
  onChange: (value: string | undefined) => void
  label?: string
}

export function LogoUploader({
  value,
  onChange,
  label = "Logo de la Comunidad",
}: LogoUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      onChange(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    inputRef.current?.click()
  }

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onChange(undefined)
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            <Image
              src={value}
              alt="Vista previa del logo"
              width={64}
              height={64}
              unoptimized
              className="size-full object-contain"
            />
          ) : (
            <IconCommand className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleButtonClick}
          >
            <IconUpload className="mr-2 size-4" />
            Subir logo
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
            >
              <IconTrash className="mr-2 size-4" />
              Eliminar
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onClick={(event) => event.stopPropagation()}
          onChange={handleFileChange}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Formatos recomendados: PNG, JPG, SVG. Máximo 2 MB.
      </p>
    </div>
  )
}
