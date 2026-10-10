// ---------- 1. Select the elements ----------
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// All loaded users are stored here. The filter works on this array,
// so typing in the filter box never makes a new request.
let users = [];

// ---------- 2. Load users from the API ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  usersList.innerHTML = "";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    users = await response.json();
    filterInput.value = "";
    renderUsers(users);
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    users = [];
    statusText.textContent = "Could not load users. Please try again.";
    console.error("Load failed:", error.message);
  } finally {
    loadBtn.disabled = false; // runs after success or failure
  }
}

// ---------- 3. Draw any array of users ----------
function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.appendChild(li);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(email);
    li.appendChild(city);
    li.appendChild(company);
    usersList.appendChild(li);
  });
}

// ---------- 4. Filter the stored array (no new request) ----------
function filterUsers() {
  if (users.length === 0) {
    return; // nothing loaded yet, so there is nothing to filter
  }

  const term = filterInput.value.trim().toLowerCase();
  const matches = users.filter((user) => user.name.toLowerCase().includes(term));
  renderUsers(matches);
}

// ---------- 5. Listeners ----------
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);
