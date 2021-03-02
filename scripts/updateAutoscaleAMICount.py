#!/usr/bin/env python3

import sys
import os
import json
from random import randint
from time import sleep
import math

AUTOSCALE_GROUP_NAME = "GPNB-AS-swarm-compute-m3-med-copy"
MAX_NUM_USER_KERNELS_PER_AMI = 5
CONTAINER = "genepattern/genepattern-notebook"

# Import config from nbrepo app, if possible
try:
    import nbrepo.settings as settings  # nbrepo needs to be on your Python path
    AUTOSCALE_GROUP_NAME = settings.AUTOSCALE_GROUP_NAME if hasattr(settings, 'AUTOSCALE_GROUP_NAME') else AUTOSCALE_GROUP_NAME
    MAX_NUM_USER_KERNELS_PER_AMI = settings.MAX_NUM_USER_KERNELS_PER_AMI if hasattr(settings, 'MAX_NUM_USER_KERNELS_PER_AMI') else MAX_NUM_USER_KERNELS_PER_AMI
    CONTAINER = settings.CONTAINER if hasattr(settings, 'CONTAINER') else CONTAINER
except ImportError:
    # Otherwise, import from an environment variable
    if 'AUTOSCALE_GROUP_NAME' in os.environ:
        AUTOSCALE_GROUP_NAME = os.environ['AUTOSCALE_GROUP_NAME']
    if 'MAX_NUM_USER_KERNELS_PER_AMI' in os.environ:
        MAX_NUM_USER_KERNELS_PER_AMI = os.environ['MAX_NUM_USER_KERNELS_PER_AMI']
    if 'CONTAINER' in os.environ:
        CONTAINER = os.environ['CONTAINER']


def updateAutoscaleAmiCount():
    print("Checking number of running instances in  ")
    # look at docker and see how many containers are running now
    print(f"docker ps | grep \"{CONTAINER}\" | wc -l")
    dockerPsCount = int(os.popen(f"docker service ls | grep \"{CONTAINER}\" | wc -l").read())

    print("Currently have user kernels running: " + str(dockerPsCount))

    # look for the autoscale group I am launching compute nodes in by name
    # and see how many compute AMI instances it has running in it
    print(AUTOSCALE_GROUP_NAME)
    os.system("aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names " + AUTOSCALE_GROUP_NAME + " > autoscalegroups.json")
    x = open('autoscalegroups.json')
    d = json.load(x)

    groupInstanceCount = 0
    groupName = ""
    desiredCount = 1
    maxSize = 1
    for group in d['AutoScalingGroups']:
        for instance in group['Instances']:
            if (AUTOSCALE_GROUP_NAME == group['AutoScalingGroupName']):
                groupName = group['AutoScalingGroupName']
                desiredCount = group['DesiredCapacity']
                maxSize = group['MaxSize']
                groupInstanceCount = len(group['Instances'])
                print("Found group : " + group['AutoScalingGroupName'] + " with instance count " + str(groupInstanceCount))

    if desiredCount < groupInstanceCount:
        print("Some compute node is or soon will be shutting down")
        return None
    elif desiredCount > groupInstanceCount:
        print("Launch of another compute node is in progress or imminent")
        return None

    print("Decide what to do...  we have " + str(dockerPsCount) + " jupyter users and " + str(
        groupInstanceCount) + " compute nodes. The group can scale up to  " + str(maxSize))

    #
    newDesiredAmiCount = int(math.ceil(float(dockerPsCount) / float(MAX_NUM_USER_KERNELS_PER_AMI)))  # round up

    newDesiredCount = min(maxSize, newDesiredAmiCount)
    print("The new desired AMI count is " + str(newDesiredCount))
    if (newDesiredCount <= desiredCount):
        print("No new autoscale nodes needed.  Exitting...")
        return
    # update the autoscale group to increase the desired count to the new value
    asChange = os.popen("aws autoscaling set-desired-capacity --auto-scaling-group-name " + groupName + " --desired-capacity " + str(newDesiredCount)).read()
    print(asChange)
    print(" Autoscale increment returned " + asChange)


if __name__ == '__main__':
    updateAutoscaleAmiCount()