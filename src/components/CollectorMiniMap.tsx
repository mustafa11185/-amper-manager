'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Stop = {
  lat: number
  lng: number
  started_at: string
  duration_minutes: number
}

type Props = {
  currentLocation: { lat: number; lng: number } | null
  stops: Stop[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
}

export default function CollectorMiniMap({ currentLocation, stops }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Destroy previous map
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const center = currentLocation
      ? [currentLocation.lat, currentLocation.lng] as [number, number]
      : stops.length > 0
        ? [stops[0].lat, stops[0].lng] as [number, number]
        : [33.3152, 44.3661] as [number, number]

    const map = L.map(containerRef.current, { center, zoom: 15, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM', maxZoom: 19,
    }).addTo(map)

    // Current location — blue dot
    if (currentLocation) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid #FFF;box-shadow:0 0 8px rgba(59,130,246,0.5);"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      L.marker([currentLocation.lat, currentLocation.lng], { icon }).addTo(map)
        .bindPopup('<div style="direction:rtl;font-family:Tajawal,sans-serif;font-weight:700;">📍 الموقع الحالي</div>')
    }

    // Stop markers — orange
    stops.forEach(s => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:rgba(245,158,11,0.35);border:2.5px solid #F59E0B;"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
      L.marker([s.lat, s.lng], { icon }).addTo(map)
        .bindPopup(`<div style="direction:rtl;font-family:Tajawal,sans-serif;">
          <p style="font-weight:700;margin:0;color:#D97706;">⏸ توقف ${s.duration_minutes} دقيقة</p>
          <p style="font-size:11px;color:#64748B;margin:2px 0 0;">الساعة ${formatTime(s.started_at)}</p>
        </div>`)
    })

    // Fit bounds if multiple points
    const allPoints: [number, number][] = [
      ...(currentLocation ? [[currentLocation.lat, currentLocation.lng] as [number, number]] : []),
      ...stops.map(s => [s.lat, s.lng] as [number, number]),
    ]
    if (allPoints.length > 1) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] })
    }

    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [currentLocation, stops])

  return <div ref={containerRef} className="w-full rounded-2xl overflow-hidden" style={{ height: 220 }} />
}
