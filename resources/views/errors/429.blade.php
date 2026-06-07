{{-- 429 — ส่งคำขอถี่เกินไป (Too Many Requests) --}}
@extends('errors.layout')

@section('code', '429')
@section('heading_en', 'Too Many Requests')
@section('heading_th', 'คำขอมากเกินไป')
@section('message_en', 'You have sent too many requests. Please wait a moment and try again.')
@section('message_th', 'คุณส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง')
