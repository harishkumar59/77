import { createClient } from '@supabase/supabase-js';
import * as faceapi from 'face-api.js';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const salesPage = document.getElementById('salesPage');
const workersPage = document.getElementById('workersPage');
const loginForm = document.getElementById('loginForm');
const orderForm = document.getElementById('orderForm');
const navLinks = document.querySelectorAll('.nav-link');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');

// State
let currentUser = null;
let faceDetectionModel = null;

// Authentication
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    userEmail.textContent = currentUser.email;
    showPage('dashboard');
  } catch (error) {
    alert('Error logging in: ' + error.message);
  }
}

async function handleLogout() {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    showPage('login');
  } catch (error) {
    alert('Error logging out: ' + error.message);
  }
}

// Navigation
function showPage(pageId) {
  const pages = [loginPage, dashboardPage, salesPage, workersPage];
  pages.forEach(page => page.classList.add('hidden'));

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageId) {
      link.classList.add('active');
    }
  });

  switch (pageId) {
    case 'login':
      loginPage.classList.remove('hidden');
      break;
    case 'dashboard':
      dashboardPage.classList.remove('hidden');
      loadDashboardData();
      break;
    case 'sales':
      salesPage.classList.remove('hidden');
      loadOrders();
      break;
    case 'workers':
      workersPage.classList.remove('hidden');
      initializeFaceDetection();
      loadWorkerData();
      break;
  }
}

// Dashboard Functions
async function loadDashboardData() {
  try {
    const [salesData, workersData, ordersData] = await Promise.all([
      supabase.from('orders').select('amount'),
      supabase.from('profiles').select('id').eq('role', 'worker'),
      supabase.from('orders').select('id').eq('status', 'pending')
    ]);

    const totalSales = salesData.data.reduce((sum, order) => sum + order.amount, 0);
    document.getElementById('totalSales').textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById('activeWorkers').textContent = workersData.data.length;
    document.getElementById('pendingOrders').textContent = ordersData.data.length;
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

// Sales Management Functions
async function handleOrderSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  try {
    const { error } = await supabase.from('orders').insert({
      customer_name: formData.get('customerName'),
      amount: parseFloat(formData.get('amount')),
      payment_method: formData.get('paymentMethod'),
      salesman_id: currentUser.id,
      status: 'pending'
    });

    if (error) throw error;
    
    e.target.reset();
    loadOrders();
  } catch (error) {
    alert('Error submitting order: ' + error.message);
  }
}

async function loadOrders() {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        salesman:profiles!salesman_id(email),
        driver:profiles!driver_id(email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = data.map(order => `
      <div class="order-card">
        <h4>${order.customer_name}</h4>
        <p>Amount: $${order.amount}</p>
        <p>Status: ${order.status}</p>
        <p>Payment: ${order.payment_method}</p>
        <p>Salesman: ${order.salesman.email}</p>
        ${order.driver ? `<p>Driver: ${order.driver.email}</p>` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading orders:', error);
  }
}

// Worker Management Functions
async function initializeFaceDetection() {
  if (!faceDetectionModel) {
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    faceDetectionModel = true;
  }

  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
  }
}

async function handleAttendance() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  
  try {
    const detection = await faceapi.detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      const { error } = await supabase.from('attendance').insert({
        worker_id: currentUser.id,
        check_in: new Date().toISOString(),
        face_match_score: 1 // In a real app, compare with stored face descriptor
      });

      if (error) throw error;
      alert('Attendance marked successfully!');
    } else {
      alert('No face detected. Please try again.');
    }
  } catch (error) {
    alert('Error marking attendance: ' + error.message);
  }
}

async function loadWorkerData() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabase
      .from('worker_performance')
      .select('*')
      .eq('worker_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data.length > 0) {
      const performance = data[0];
      document.getElementById('attendanceRate').textContent = `${performance.attendance_percentage}%`;
      document.getElementById('workingHours').textContent = `${performance.working_hours}h`;
      document.getElementById('currentSalary').textContent = `$${performance.salary}`;
    }
  } catch (error) {
    console.error('Error loading worker data:', error);
  }
}

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
orderForm.addEventListener('submit', handleOrderSubmit);
logoutBtn.addEventListener('click', handleLogout);
document.getElementById('captureBtn').addEventListener('click', handleAttendance);

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUser) {
      showPage(link.dataset.page);
    }
  });
});

// Check initial auth state
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    userEmail.textContent = currentUser.email;
    showPage('dashboard');
  } else {
    showPage('login');
  }
});