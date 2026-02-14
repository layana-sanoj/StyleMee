// ================= CONFIGURATION =================
const API_URL = 'http://localhost:3000/api';
let currentUser = null;

// ================= PAGE NAVIGATION =================
function showPage(pageId) {
    // Hide all pages
    const pages = ['welcomePage', 'loginPage', 'signupPage', 'homePage', 'profilePage', 'feedPage'];
    pages.forEach(page => {
        const element = document.getElementById(page);
        if (element) {
            element.classList.add('hidden');
        }
    });
    
    // Show requested page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    
    // Load feed if navigating to feed page
    if (pageId === 'feedPage') {
        loadFeed();
    }
}

// Legacy go() function for compatibility
function go(page) {
    const pageMap = {
        'signup.html': 'signupPage',
        'login.html': 'loginPage',
        'home.html': 'homePage',
        'feed.html': 'feedPage',
        'profile.html': 'profilePage',
        'index.html': 'welcomePage'
    };
    showPage(pageMap[page] || 'welcomePage');
}

// ================= AUTH =================
async function signup() {
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
            return;
        }

        alert("Account created! Please login.");
        document.getElementById("signupEmail").value = "";
        document.getElementById("signupPassword").value = "";
        showPage('loginPage');
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function login() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
            return;
        }

        currentUser = { email: data.email };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Update user display
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) {
            userDisplay.textContent = `Logged in as: ${currentUser.email}`;
        }
        
        showPage('homePage');
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    showPage('welcomePage');
}

// ================= CANVAS LOAD =================
const canvas = document.getElementById("canvas");
const ctx = canvas?.getContext("2d");
const imageInput = document.getElementById("imageInput");
let img = new Image();
let imageLoaded = false;

imageInput?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = ev => {
        img.onload = () => {
            // Resize large images
            let width = img.width;
            let height = img.height;
            const maxSize = 800;

            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = (height / width) * maxSize;
                    width = maxSize;
                } else {
                    width = (width / height) * maxSize;
                    height = maxSize;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            imageLoaded = true;
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// ================= BLUR =================
let startX, startY, endX, endY, selecting = false;

function enableBlurSelect() {
    if (!canvas) return;
    if (!imageLoaded) {
        alert("Please upload an image first!");
        return;
    }

    alert("Click and drag on the image to select an area to blur");

    canvas.onmousedown = e => {
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        selecting = true;
    };

    canvas.onmouseup = e => {
        if (!selecting) return;
        const rect = canvas.getBoundingClientRect();
        endX = e.clientX - rect.left;
        endY = e.clientY - rect.top;
        selecting = false;
        blurArea();
    };
}

function blurArea() {
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    if (w > 0 && h > 0) {
        ctx.filter = "blur(12px)";
        ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
        ctx.filter = "none";
    }
}

// ================= CREATE POST =================
async function createPost() {
    if (!currentUser) {
        alert("Login first");
        return;
    }

    const question = document.getElementById("question").value.trim();
    const optionA = document.getElementById("optA").value.trim();
    const optionB = document.getElementById("optB").value.trim();

    if (!question || !optionA || !optionB) {
        alert("Fill all fields");
        return;
    }

    if (!canvas || !imageLoaded) {
        alert("Upload image first");
        return;
    }

    try {
        const imageData = canvas.toDataURL("image/jpeg", 0.8);

        const response = await fetch(`${API_URL}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userEmail: currentUser.email,
                imageData,
                question,
                optionA,
                optionB
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
            return;
        }

        alert("Posted successfully!");

        // Clear form
        document.getElementById("question").value = "";
        document.getElementById("optA").value = "";
        document.getElementById("optB").value = "";
        document.getElementById("imageInput").value = "";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        imageLoaded = false;

        showPage('feedPage');
    } catch (error) {
        alert("Upload failed: " + error.message);
    }
}

// ================= FEED =================
async function loadFeed() {
    const feed = document.getElementById("feed");
    if (!feed) return;

    try {
        const response = await fetch(`${API_URL}/posts`);
        const posts = await response.json();

        feed.innerHTML = "";

        if (posts.length === 0) {
            feed.innerHTML = '<p>No posts yet. Create the first one!</p>';
            return;
        }

        for (const post of posts) {
            const hasVoted = await checkVote(post.id);
            
            let deleteBtn = "";
            if (currentUser && currentUser.email === post.user_email) {
                deleteBtn = `<button onclick="deletePost(${post.id})">Delete</button>`;
            }

            let voteButtons = "";
            if (currentUser) {
                if (!hasVoted) {
                    voteButtons = `
                        <button onclick="vote(${post.id}, 'A')">${post.option_a} (${post.votes_a})</button>
                        <button onclick="vote(${post.id}, 'B')">${post.option_b} (${post.votes_b})</button>
                    `;
                } else {
                    voteButtons = `
                        <p>${post.option_a}: ${post.votes_a} votes</p>
                        <p>${post.option_b}: ${post.votes_b} votes</p>
                    `;
                }
            } else {
                voteButtons = `
                    <p>${post.option_a}: ${post.votes_a} votes</p>
                    <p>${post.option_b}: ${post.votes_b} votes</p>
                `;
            }

            feed.innerHTML += `
                <div class="card">
                    <img src="http://localhost:3000/images/${post.img_filename}" style="max-width:100%; border-radius:8px;" alt="Post image">
                    <h3>${post.question}</h3>
                    <p><small>by ${post.user_email}</small></p>
                    ${voteButtons}
                    ${deleteBtn}
                </div>
            `;
        }
    } catch (error) {
        console.error("Error loading feed:", error);
        feed.innerHTML = '<p>Error loading posts</p>';
    }
}

async function checkVote(postId) {
    if (!currentUser) return false;
    
    try {
        const response = await fetch(`${API_URL}/posts/${postId}/vote/${currentUser.email}`);
        const data = await response.json();
        return data.hasVoted;
    } catch (error) {
        return false;
    }
}

async function vote(postId, choice) {
    if (!currentUser) {
        alert("Please login to vote");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/posts/${postId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userEmail: currentUser.email,
                choice
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
            return;
        }

        loadFeed();
    } catch (error) {
        alert("Error voting: " + error.message);
    }
}

// ================= DELETE =================
async function deletePost(id) {
    if (!confirm("Are you sure you want to delete this post?")) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/posts/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail: currentUser.email })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error);
            return;
        }

        loadFeed();
    } catch (error) {
        alert("Error deleting post: " + error.message);
    }
}

// ================= INITIALIZE APP =================
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        
        // Update user display
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) {
            userDisplay.textContent = `Logged in as: ${currentUser.email}`;
        }
        
        showPage('homePage');
    } else {
        showPage('welcomePage');
    }
});
