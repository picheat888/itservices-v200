{{-- 403 — ไม่มีสิทธิ์เข้าถึง (Forbidden) --}}
@extends('errors.layout')

@section('code', '403')
@section('heading_en', 'Access Forbidden')
@section('heading_th', 'ไม่มีสิทธิ์เข้าถึง')
@section('message_en', 'You do not have permission to access this page.')
@section('message_th', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ หากคิดว่าเป็นข้อผิดพลาด กรุณาติดต่อผู้ดูแลระบบ')
