(async () => {

    const token = localStorage.getItem("token");
    const loginTime = Number(localStorage.getItem("loginTime"));

    const SESSION_TIME = 60 * 60 * 1000; // 1 hour

    if (
        !token ||
        !loginTime ||
        (Date.now() - loginTime) > SESSION_TIME
    ) {

        localStorage.removeItem("token");
        localStorage.removeItem("loginTime");

        window.location.replace("../index.html");
        return;

    }

    try {

        const response = await fetch("/api/verify", {

            headers: {
                Authorization: "Bearer " + token
            }

        });

        const data = await response.json();

        if (!response.ok || !data.success) {

            throw new Error("Invalid session");

        }

    } catch (err) {

        localStorage.removeItem("token");
        localStorage.removeItem("loginTime");

        window.location.replace("../index.html");

    }

})();