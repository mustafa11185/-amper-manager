'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Collector = {
  staff_id: string
  name: string
  photo_url: string | null
  lat: number
  lng: number
  last_seen: string
  minutes_ago: number
}

type Props = {
  collectors: Collector[]
  onCollectorTap: (staffId: string) => void
}

function createCollectorIcon(name: string): L.DivIcon {
  const initial = name.charAt(0)
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:18px;height:18px;border-radius:50%;background:#3B82F6;border:2.5px solid #FFF;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;color:#FFF;font-weight:700;">${initial}</div>
      <div style="background:#FFF;border-radius:6px;padding:1px 5px;margin-top:2px;font-size:10px;font-weight:700;color:#0F172A;box-shadow:0 1px 4px rgba(0,0,0,0.15);white-space:nowrap;font-family:Tajawal,sans-serif;">${name.split(' ')[0]}</div>
    </div>`,
    iconSize: [60, 40],
    iconAnchor: [30, 10],
  })
}

const DEFAULT_CENTER: [number, number] = [33.3152, 44.3661]
const DEFAULT_ZOOM = 14

export default function LiveMap({ collectors, onCollectorTap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [branchCenter, setBranchCenter] = useState<[number, number] | null>(null)

  // Fetch branch GPS for centering
  useEffect(() => {
    fetch('/api/settings/branch')
      .then(r => r.json())
      .then(bd => {
        if (bd.branch?.gps_lat && bd.branch?.gps_lng) {
          setBranchCenter([Number(bd.branch.gps_lat), Number(bd.branch.gps_lng)])
        }
      })
      .catch(() => {})
  }, [])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const center = branchCenter
      || (collectors.length > 0 ? [collectors[0].lat, collectors[0].lng] as [number, number] : DEFAULT_CENTER)

    const map = L.map(containerRef.current, { center, zoom: DEFAULT_ZOOM, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCenter])

  // Recenter when branch loads
  useEffect(() => {
    if (mapRef.current && branchCenter) mapRef.current.setView(branchCenter, DEFAULT_ZOOM)
  }, [branchCenter])

  // Update collector markers
  useEffect(() => {
    if (!layerRef.current) return
    layerRef.current.clearLayers()

    collectors.forEach(c => {
      const marker = L.marker([c.lat, c.lng], { icon: createCollectorIcon(c.name) })
      marker.bindPopup(`
        <div style="direction:rtl;font-family:Tajawal,sans-serif;min-width:120px;">
          <p style="font-weight:700;margin:0 0 4px;">${c.name}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">آخر ظهور: منذ ${c.minutes_ago} دقيقة</p>
        </div>
      `)
      marker.on('click', () => onCollectorTap(c.staff_id))
      layerRef.current!.addLayer(marker)
    })
  }, [collectors, onCollectorTap])

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
}
