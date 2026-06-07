{{-- 503 — ระบบปิดปรับปรุงชั่วคราว (Service Unavailable / Maintenance) --}}
@extends('errors.layout')

@section('code', '503')
@section('heading_en', 'Service Unavailable')
@section('heading_th', 'ปิดปรับปรุงระบบชั่วคราว')
@section('message_en', 'We are down for maintenance. Please check back again shortly.')
@section('message_th', 'ขณะนี้ระบบกำลังปิดปรับปรุง กรุณากลับมาใหม่อีกครั้งในภายหลัง ขออภัยในความไม่สะดวก')
