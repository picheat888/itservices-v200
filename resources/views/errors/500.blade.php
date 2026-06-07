{{-- 500 — เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error) --}}
@extends('errors.layout')

@section('code', '500')
@section('heading_en', 'Internal Server Error')
@section('heading_th', 'เกิดข้อผิดพลาดภายในระบบ')
@section('message_en', 'There was an error. Please try again later.')
@section('message_th', 'ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง')
