'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Collector = {
  staff_id: string
  name: string
  lat: number
  lng: number
  last_seen: string
  minutes_ago: number
  is_stop: boolean
  stop_duration_min: number
}

type PathPoint = {
  lat: number
  lng: number
  logged_at: string
  is_stop: boolean
  stop_minutes: number
}

type SubPin = {
  id: string
  name: string
  serial_number: string
  lat: number
  lng: number
  is_paid: boolean
  total_debt: number
}

type Props = {
  collectors: Collector[]
  subscribers: SubPin[]
  paths: PathPoint[]
  showStops: boolean
  selectedCollector: string | null
  onCollectorClick: (id: string) => void
}

const fmt = (n: number) => Number(n).toLocaleString('en')

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
}

function collectorColor(c: Collector): string {
  if (c.is_stop && c.stop_duration_min >= 3) return '#EF4444' // red — suspicious
  if (c.is_stop) return '#F59E0B' // orange — brief stop
  return '#3B82F6' // blue — moving
}

function collectorStatus(c: Collector): string {
  if (c.is_stop && c.stop_duration_min >= 3) return `متوقف ${c.stop_duration_min} دقيقة`
  if (c.is_stop) return 'متوقف'
  return 'يتحرك'
}

function createDotIcon(color: string, size: number = 14): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function createSubIcon(isPaid: boolean): L.DivIcon {
  const bg = isPaid ? '#059669' : '#EF4444'
  const emoji = isPaid ? '✅' : '❌'
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid #FFF;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${emoji}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function createStopIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:rgba(245,158,11,0.35);border:2px solid #F59E0B;"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

// Baghdad default center
const DEFAULT_CENTER: [number, number] = [33.3152, 44.3661]
const DEFAULT_ZOOM = 14

export default function MapView({ collectors, subscribers, paths, showStops, selectedCollector, onCollectorClick }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<{
    collectors: L.LayerGroup
    subscribers: L.LayerGroup
    path: L.LayerGroup
    stops: L.LayerGroup
  } | null>(null)
  const [branchCenter, setBranchCenter] = useState<[number, number] | null>(null)

  // Fetch branch GPS for initial center
  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(data => {
        if (data.gauges?.branch_id) {
          fetch(`/api/settings/branch`)
            .then(r => r.json())
            .then(bd => {
              if (bd.branch?.gps_lat && bd.branch?.gps_lng) {
                setBranchCenter([Number(bd.branch.gps_lat), Number(bd.branch.gps_lng)])
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const center = branchCenter || (collectors.length > 0
      ? [collectors[0].lat, collectors[0].lng] as [number, number]
      : DEFAULT_CENTER)

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    layersRef.current = {
      collectors: L.layerGroup().addTo(map),
      subscribers: L.layerGroup().addTo(map),
      path: L.layerGroup().addTo(map),
      stops: L.layerGroup().addTo(map),
    }

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchCenter])

  // Update center when branch center loads
  useEffect(() => {
    if (mapRef.current && branchCenter) {
      mapRef.current.setView(branchCenter, DEFAULT_ZOOM)
    }
  }, [branchCenter])

  // Update collector markers
  useEffect(() => {
    if (!layersRef.current) return
    const layer = layersRef.current.collectors
    layer.clearLayers()

    collectors.forEach(c => {
      const color = collectorColor(c)
      const marker = L.marker([c.lat, c.lng], { icon: createDotIcon(color, 16) })
      marker.bindPopup(`
        <div style="direction:rtl;font-family:Tajawal,sans-serif;min-width:140px;">
          <p style="font-weight:700;margin:0 0 4px;">${c.name}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">الحالة: ${collectorStatus(c)}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">آخر ظهور: منذ ${c.minutes_ago} دقيقة</p>
        </div>
      `)
      marker.on('click', () => onCollectorClick(c.staff_id))
      layer.addLayer(marker)
    })

    // Fly to selected collector
    if (selectedCollector) {
      const sc = collectors.find(c => c.staff_id === selectedCollector)
      if (sc && mapRef.current) {
        mapRef.current.panTo([sc.lat, sc.lng])
      }
    }
  }, [collectors, selectedCollector, onCollectorClick])

  // Update subscriber markers
  useEffect(() => {
    if (!layersRef.current) return
    const layer = layersRef.current.subscribers
    layer.clearLayers()

    subscribers.forEach(s => {
      const marker = L.marker([s.lat, s.lng], { icon: createSubIcon(s.is_paid) })
      marker.bindPopup(`
        <div style="direction:rtl;font-family:Tajawal,sans-serif;min-width:140px;">
          <p style="font-weight:700;margin:0 0 4px;">${s.name}</p>
          <p style="font-size:11px;color:#64748B;margin:0;">#${s.serial_number}</p>
          <p style="font-size:12px;font-weight:700;margin:4px 0 0;color:${s.is_paid ? '#059669' : '#EF4444'};">
            ${s.is_paid ? '✅ مدفوع' : `❌ غير مدفوع — دين: ${fmt(s.total_debt)} د.ع`}
          </p>
        </div>
      `)
      layer.addLayer(marker)
    })
  }, [subscribers])

  // Update path trail
  useEffect(() => {
    if (!layersRef.current) return
    const pathLayer = layersRef.current.path
    const stopsLayer = layersRef.current.stops
    pathLayer.clearLayers()
    stopsLayer.clearLayers()

    if (paths.length < 2) return

    // Draw trail polyline
    const latlngs = paths.map(p => [p.lat, p.lng] as [number, number])
    const polyline = L.polyline(latlngs, {
      color: '#3B82F6',
      weight: 3,
      opacity: 0.7,
      dashArray: '8, 6',
    })
    pathLayer.addLayer(polyline)

    // Draw stop markers
    if (showStops) {
      paths
        .filter(p => p.is_stop && p.stop_minutes >= 3)
        .forEach(p => {
          const marker = L.marker([p.lat, p.lng], { icon: createStopIcon() })
          marker.bindPopup(`
            <div style="direction:rtl;font-family:Tajawal,sans-serif;">
              <p style="font-weight:700;margin:0;color:#D97706;">⏸ توقف ${p.stop_minutes} دقيقة</p>
              <p style="font-size:11px;color:#64748B;margin:2px 0 0;">الساعة ${formatTime(p.logged_at)}</p>
            </div>
          `)
          stopsLayer.addLayer(marker)
        })
    }
  }, [paths, showStops])

  return (
    <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '100%' }} />
  )
}
