{{-- 419 — เซสชันหมดอายุ / CSRF token ไม่ถูกต้อง (Page Expired) --}}
@extends('errors.layout')

@section('code', '419')
@section('heading_en', 'Page Expired')
@section('heading_th', 'เซสชันหมดอายุ')
@section('message_en', 'This page expired due to inactivity. Please refresh and try again.')
@section('message_th', 'หน้านี้หมดอายุเนื่องจากไม่มีการใช้งานนานเกินไป กรุณารีเฟรชแล้วลองใหม่อีกครั้ง')
