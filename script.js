function checkPassword(){
    return document.getElementById("password").value == "2021-09-11";
}

function display(){
    if(checkPassword()){
        window.location.replace("https://kpeguero16.github.io/365Days/menu");
    } 
    else{

    }
}

