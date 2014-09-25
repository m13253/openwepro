# OpenWepro config file

# Address to listen on
# Set it to "127.0.0.1" to listen on only local loopback interface,
# or to "0.0.0.0" to listen on all IPv4 interfaces.
# Since OpenWepro requires a load balancer, "127.0.0.1" is preferred.
listen_address = "127.0.0.1"

# TCP port to listen on
listen_port = 8080

# Path prefix
# OpenWepro's home page will accessible at this path.
path_prefix = "/"

# Passwords
# Disable password if empty.
passwords = {
"user1": "password",
"user2": "password",
}
