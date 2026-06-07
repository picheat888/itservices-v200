{{-- 404 — ไม่พบหน้าที่ร้องขอ (Not Found) --}}
@extends('errors.layout')

@section('code', '404')
@section('heading_en', 'Page Not Found')
@section('heading_th', 'ไม่พบหน้าที่คุณค้นหา')
@section('message_en', 'The page may have been moved, removed, or never existed.')
@section('message_th', 'หน้านี้อาจถูกย้าย ลบออก หรือไม่เคยมีอยู่ ลองตรวจสอบ URL อีกครั้ง')
