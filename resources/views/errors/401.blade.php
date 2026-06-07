{{-- 401 — ยังไม่ได้เข้าสู่ระบบ (Unauthorized) --}}
@extends('errors.layout')

@section('code', '401')
@section('heading_en', 'Authentication Required')
@section('heading_th', 'กรุณาเข้าสู่ระบบ')
@section('message_en', 'You need to sign in before accessing this page.')
@section('message_th', 'คุณต้องเข้าสู่ระบบก่อนจึงจะเข้าถึงหน้านี้ได้')
