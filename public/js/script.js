const API_URL = '/api/notes';
let currentNoteColor = '#ffffff';
let allNotes = [];
let notifiedIds = new Set();
let fpInstance; 

// 1. Initialize Quill
var quill = new Quill('#editor-container', {
    theme: 'snow',
    modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }]] }
});

// 2. Initialize Flatpickr
document.addEventListener('DOMContentLoaded', function() {
    fpInstance = flatpickr("#timeInput", {
        enableTime: true,
        dateFormat: "Y-m-d H:i", 
        altInput: true,          
        altFormat: "F j, Y at h:i K",
        time_24hr: false,        
        minDate: "today",
        onChange: function(selectedDates, dateStr, instance) {
            updateCountdown(dateStr); 
        }
    });
});

// --- Fetch & Render ---
async function fetchNotes() {
    const res = await fetch(API_URL);
    allNotes = await res.json();
    renderNotes(allNotes);
}

function renderNotes(notes) {
    const grid = document.getElementById('notesGrid');
    grid.innerHTML = '';
    
    const now = new Date();

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.style.backgroundColor = note.color; // Keep user selected color
        card.onclick = () => openNote(note);

        const tmp = document.createElement("DIV");
        tmp.innerHTML = note.content;
        const plainText = tmp.textContent || tmp.innerText || "";

        const fileBadge = note.file_path ? `<span style="font-size:0.8rem">📎</span>` : '';
        
        // --- GREEN TEXT LOGIC ---
        let timeBadge = '';
        if(note.reminder_time) {
            const date = new Date(note.reminder_time);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            
            // Check if alarm is done
            let textColor = '#d32f2f'; // Default Red
            let icon = '⏰';
            
            if (now >= date) {
                textColor = '#2e7d32'; // Green
                icon = '✅';
            }

            timeBadge = `<div style="margin-top:5px; font-size:0.8rem; color:${textColor}; font-weight:bold;">${icon} ${dateStr}, ${timeStr}</div>`;
        }

        card.innerHTML = `
            <div class="note-title">${note.title} ${fileBadge}</div>
            <div class="note-preview">${plainText.substring(0, 100)}...</div>
            ${timeBadge}
        `;
        grid.appendChild(card);
    });
}

function openNewNote() {
    document.getElementById('noteId').value = '';
    document.getElementById('editTitle').value = '';
    quill.root.innerHTML = '';
    document.getElementById('fileLabel').innerText = 'No file selected';
    document.getElementById('downloadLink').style.display = 'none';
    
    fpInstance.clear(); 
    document.getElementById('repeatInput').value = 1; 
    document.getElementById('countdownBox').innerHTML = '⏳ No alarm set';

    setColor('#ffffff');
    document.getElementById('noteModal').style.display = 'flex';
}

function openNote(note) {
    document.getElementById('noteId').value = note.id;
    document.getElementById('editTitle').value = note.title;
    quill.root.innerHTML = note.content;
    
    document.getElementById('repeatInput').value = note.repeat_count || 1;

    // File
    const link = document.getElementById('downloadLink');
    if(note.file_path) {
        link.href = '/' + note.file_path;
        link.innerText = `Download: ${note.file_original_name}`;
        link.style.display = 'block';
        document.getElementById('fileLabel').style.display = 'none';
    } else {
        link.style.display = 'none';
        document.getElementById('fileLabel').style.display = 'inline';
        document.getElementById('fileLabel').innerText = 'No file attached';
    }

    // Time
    if(note.reminder_time) {
        fpInstance.setDate(note.reminder_time);
        updateCountdown(note.reminder_time);    
    } else {
        fpInstance.clear();
        document.getElementById('countdownBox').innerHTML = '⏳ No alarm set';
    }

    setColor(note.color);
    document.getElementById('noteModal').style.display = 'flex';
}

function closeModal(e) {
    if (e.target.id === 'noteModal') document.getElementById('noteModal').style.display = 'none';
}

function setColor(color) {
    currentNoteColor = color;
    document.getElementById('modalContent').style.backgroundColor = color;
}

function updateFileLabel() {
    const file = document.getElementById('fileInput').files[0];
    if(file) document.getElementById('fileLabel').innerText = file.name;
}

function updateCountdown(dateStr) {
    if(!dateStr) return;
    const targetDate = new Date(dateStr);
    const now = new Date();
    const diff = targetDate - now;
    const box = document.getElementById('countdownBox');

    if (diff <= 0) {
        box.innerHTML = "🔴 Alarm Passed";
        box.style.color = "gray";
        return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    box.innerHTML = `⏳ Due in: ${days}d ${hours}h ${minutes}m`;
    box.style.color = "#d32f2f";
}

async function saveAndClose() {
    console.log("Attempting to save...");

    const id = document.getElementById('noteId').value;
    const title = document.getElementById('editTitle').value.trim();
    const rawText = quill.getText();
    const isContentEmpty = rawText.trim().length === 0;
    const fileInput = document.getElementById('fileInput');
    const hasFile = fileInput.files.length > 0;

    if (!title && isContentEmpty && !hasFile) {
        alert("⚠️ Cannot save an empty note!");
        return;
    }

    const contentHtml = quill.root.innerHTML;
    const repeatCount = document.getElementById('repeatInput').value;

    // --- GET TIME ---
    let timeInput = null;
    if(fpInstance.selectedDates.length > 0) {
        const date = fpInstance.selectedDates[0]; 
        const offset = date.getTimezoneOffset() * 60000;
        timeInput = new Date(date.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', contentHtml);
    formData.append('color', currentNoteColor);
    formData.append('repeat_count', repeatCount);
    
    // IMPORTANT: Send time if it exists
    if (timeInput) {
        formData.append('reminder_time', timeInput);
    }

    if (hasFile) formData.append('document', fileInput.files[0]);

    try {
        if (id) {
            // Update
            await fetch(`/api/notes/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ title, content: contentHtml, color: currentNoteColor })
            });
            if(timeInput) {
                await fetch(`/api/notes/${id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ reminder_time: timeInput, repeat_count: repeatCount })
                });
            }
        } else {
            // Create New
            await fetch(API_URL, { method: 'POST', body: formData });
        }
        
        document.getElementById('noteModal').style.display = 'none';
        fetchNotes();
        
    } catch (error) { 
        alert("Error saving"); 
        console.error(error); 
    }
}

async function deleteCurrentNote() {
    const id = document.getElementById('noteId').value;
    if(!id) return; 
    if(confirm("Are you sure?")) {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' });
        document.getElementById('noteModal').style.display = 'none';
        fetchNotes();
    }
}

function filterNotes() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const filtered = allNotes.filter(n => {
        const title = n.title ? n.title.toLowerCase() : "";
        const content = n.content ? n.content.toLowerCase() : "";
        return title.includes(query) || content.includes(query);
    });
    renderNotes(filtered);
}

// --- Browser Audio Logic ---
function enableSound() {
    document.getElementById('alarmSound').play().catch(() => {});
    Notification.requestPermission();
}

setInterval(() => {
    const now = new Date();
    allNotes.forEach(note => {
        if (note.reminder_time) {
            const reminder = new Date(note.reminder_time);
            
            // Check if Due (within last minute)
            if (now >= reminder && (now - reminder) < 60000) {
                if (!notifiedIds.has(note.id)) {
                    notifiedIds.add(note.id); 
                    
                    // 1. Play Alarm X Times
                    const rings = note.repeat_count || 1;
                    playAlarmSequence(rings);

                    // 2. Browser Notification
                    if(Notification.permission === 'granted') {
                        new Notification(`🔔 Due: ${note.title}`);
                    }
                    
                    renderNotes(allNotes); // Update Text to Green
                }
            }
        }
    });
}, 5000);

function playAlarmSequence(times) {
    const audio = document.getElementById('alarmSound');
    let count = 0;
    
    function play() {
        if(count >= times) return; 
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio blocked"));
        count++;
        setTimeout(play, 3000); 
    }
    play(); 
}

fetchNotes();