#!/usr/bin/python

import commands
output = commands.getstatusoutput("docker ps -a -f name=jupyter -q")[1]
containers = output.split('\n')
print(containers)


def is_container_running(container_id):
    output = commands.getstatusoutput("docker inspect -f {{.State.Running}} " + container_id)
    return output[1].strip() == "true"


def update_container(container_id):
    was_running = is_container_running(container_id)
    print ("RUNNING: " + str(was_running))

    # If not running, start the container
    if not was_running:
        output = commands.getstatusoutput("docker start " + container_id)
        print(output[1])

    # Update genepattern-python for Python 3
    output = commands.getstatusoutput("docker exec " + container_id + " pip install genepattern-python --upgrade")
    print(output[1])

    # Update genepattern-python for Python 2
    output = commands.getstatusoutput("docker exec " + container_id + " pip2 install genepattern-python --upgrade --target=/opt/conda/envs/python2/lib/python2.7/site-packages")
    print(output[1])

    # Update nbtools
    output = commands.getstatusoutput("docker exec " + container_id + " pip install nbtools --upgrade --no-deps")
    print(output[1])

    # Uninstall the old Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension uninstall --py nbtools")
    print(output[1])

    # Install the new Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension install --py nbtools")
    print(output[1])

    # Enable the new Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension enable nbtools --py")
    print(output[1])

    # Update genepattern-notebook
    output = commands.getstatusoutput("docker exec " + container_id + " pip install genepattern-notebook --upgrade --no-deps")
    print(output[1])

    # Uninstall the old Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension uninstall --py genepattern")
    print(output[1])

    # Install the new Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension install --py genepattern")
    print(output[1])

    # Enable the new Jupyter nbextension
    output = commands.getstatusoutput("docker exec " + container_id + " jupyter nbextension enable genepattern --py")
    print(output[1])

    # Copy the GenePattern Notebook logo
    output = commands.getstatusoutput("docker exec " + container_id + " cp /opt/conda/lib/python3.4/site-packages/notebook/static/base/images/GP_logo_on_black.png /opt/conda/lib/python3.4/site-packages/notebook/static/base/images/logo.png")
    print(output[1])

    # If it wasn't running, shut it back down again
    if not was_running:
        output = commands.getstatusoutput("docker stop " + container_id)
        print(output[1])

# Update the text container
for container_id in containers:
    update_container(container_id)
